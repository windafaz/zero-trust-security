
require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../database/database");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const { authenticateToken } = require("./middleware/auth");
const { allowRoles } = require("./policy");
const { createProxyMiddleware } = require("http-proxy-middleware");
const crypto = require("crypto");

app.use(express.json());

function verifyDevice(req, res, next) {
  const deviceId = req.get("X-Device-ID");

  if (!deviceId) {
    return res.status(400).json({
      error: "Header X-Device-ID wajib disertakan."
    });
  }

  const userId = req.user.id;

  const device = db.prepare(`
    SELECT id
    FROM devices
    WHERE user_id = ?
      AND device_id = ?
      AND aktif = 1
  `).get(userId, deviceId);

  if (!device) {
    return res.status(403).json({
      error: "Akses ditolak.",
      reason: "Perangkat tidak terdaftar untuk akun ini."
    });
  }

  req.deviceId = deviceId;
  next();
}

// Pastikan secret tersedia sebelum server dijalankan
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET belum diatur pada file .env");
}

// Mencatat aktivitas ke audit log
function writeAudit(subject, endpoint, deviceId, result, reason) {
  db.prepare(`
    INSERT INTO audit_logs
      (subject, endpoint, device_id, result, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    subject || "unknown",
    endpoint,
    deviceId || null,
    result,
    reason
  );
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

// Rute utama
app.get("/", (req, res) => {
  res.json({
    message: "Selamat datang di Zero Trust Security",
    status: "API Gateway aktif",
    health: "/health",
  });
});

// Pemeriksaan status gateway
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Zero Trust API Gateway",
    port: Number(PORT),
  });
});

// Login pengguna
app.post("/auth/login", async (req, res) => {
  const endpoint = "/auth/login";
  const { username, password } = req.body || {};
  const deviceId = req.get("X-Device-ID");

  // Memastikan data login dan identitas perangkat tersedia
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password ||
    !deviceId
  ) {
    writeAudit(
      username || "unknown",
      endpoint,
      deviceId,
      "deny",
      "Data login atau X-Device-ID tidak lengkap"
    );

    return res.status(400).json({
      error: "Username, password, dan X-Device-ID wajib diisi.",
    });
  }

  try {
    const user = db.prepare(`
      SELECT id, nim, nama, username, password_hash, role, aktif
      FROM users
      WHERE username = ?
    `).get(username.trim());

    // Respons yang sama untuk akun tidak ditemukan atau password salah
    if (
      !user ||
      !user.aktif ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      writeAudit(
        username.trim(),
        endpoint,
        deviceId,
        "deny",
        "Kredensial tidak valid atau akun tidak aktif"
      );

      return res.status(401).json({
        error: "Username atau password salah, atau akun tidak aktif.",
      });
    }

    // Perangkat harus terdaftar dan aktif untuk pengguna tersebut
    const device = db.prepare(`
      SELECT id
      FROM devices
      WHERE user_id = ?
        AND device_id = ?
        AND aktif = 1
    `).get(user.id, deviceId);

    if (!device) {
      writeAudit(
        user.username,
        endpoint,
        deviceId,
        "deny",
        "Perangkat tidak terdaftar atau tidak aktif"
      );

      return res.status(403).json({
        error: "Perangkat tidak terdaftar untuk akun ini.",
      });
    }

    // Access token berlaku 10 menit
    const accessToken = jwt.sign(
      { role: user.role },
      JWT_SECRET,
      {
        subject: String(user.id),
        expiresIn: "10m",
        algorithm: "HS256",
      }
    );

    // Refresh token berlaku 1 hari.
    const refreshToken = crypto.randomBytes(32).toString("hex");
    const refreshExpiresAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    // Simpan hash refresh token ke database.
    db.prepare(`
      INSERT INTO refresh_tokens
        (user_id, token_hash, expires_at, revoked)
      VALUES (?, ?, ?, 0)
    `).run(
      user.id,
      hashToken(refreshToken),
      refreshExpiresAt
    );

    writeAudit(
      user.username,
      endpoint,
      deviceId,
      "allow",
      "Login berhasil"
    );

    return res.json({
      message: "Login berhasil.",
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: 600,
      user: {
        id: user.id,
        nim: user.nim,
        nama: user.nama,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Kesalahan login:", error.message);

    return res.status(500).json({
      error: "Terjadi kesalahan internal pada server.",
    });
  }
});


/**
 * Memperbarui access token menggunakan refresh token.
 * Refresh token berlaku 1 hari dan hanya bisa digunakan sekali.
 */
app.post("/auth/refresh", (req, res) => {
  const endpoint = "/auth/refresh";
  const { refreshToken } = req.body || {};
  const deviceId = req.get("X-Device-ID");

  if (
    typeof refreshToken !== "string" ||
    !refreshToken ||
    !deviceId
  ) {
    writeAudit(
      "unknown",
      endpoint,
      deviceId,
      "deny",
      "Refresh token atau X-Device-ID tidak lengkap"
    );

    return res.status(400).json({
      error: "Refresh token dan X-Device-ID wajib diisi."
    });
  }

  const tokenHash = hashToken(refreshToken);

  const storedToken = db.prepare(`
    SELECT
      refresh_tokens.id,
      refresh_tokens.user_id,
      refresh_tokens.expires_at,
      users.username,
      users.role,
      users.aktif
    FROM refresh_tokens
    JOIN users ON users.id = refresh_tokens.user_id
    WHERE refresh_tokens.token_hash = ?
      AND refresh_tokens.revoked = 0
  `).get(tokenHash);

  if (
    !storedToken ||
    !storedToken.aktif ||
    new Date(storedToken.expires_at).getTime() <= Date.now()
  ) {
    writeAudit(
      "unknown",
      endpoint,
      deviceId,
      "deny",
      "Refresh token tidak valid, kedaluwarsa, atau dicabut"
    );

    return res.status(401).json({
      error: "Refresh token tidak valid atau sudah kedaluwarsa."
    });
  }

  const device = db.prepare(`
    SELECT id
    FROM devices
    WHERE user_id = ?
      AND device_id = ?
      AND aktif = 1
  `).get(storedToken.user_id, deviceId);

  if (!device) {
    writeAudit(
      storedToken.username,
      endpoint,
      deviceId,
      "deny",
      "Perangkat tidak terdaftar atau tidak aktif"
    );

    return res.status(403).json({
      error: "Perangkat tidak terdaftar untuk akun ini."
    });
  }

  // Refresh token lama dicabut setelah berhasil digunakan.
  db.prepare(`
    UPDATE refresh_tokens
    SET revoked = 1
    WHERE id = ?
  `).run(storedToken.id);

  const accessToken = jwt.sign(
    { role: storedToken.role },
    JWT_SECRET,
    {
      subject: String(storedToken.user_id),
      expiresIn: "10m",
      algorithm: "HS256"
    }
  );

  // Membuat refresh token baru dengan masa berlaku 1 hari.
  const newRefreshToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  ).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens
      (user_id, token_hash, expires_at, revoked)
    VALUES (?, ?, ?, 0)
  `).run(
    storedToken.user_id,
    hashToken(newRefreshToken),
    expiresAt
  );

  writeAudit(
    storedToken.username,
    endpoint,
    deviceId,
    "allow",
    "Access token berhasil diperbarui"
  );

  return res.json({
    message: "Access token berhasil diperbarui.",
    accessToken,
    refreshToken: newRefreshToken,
    tokenType: "Bearer",
    expiresIn: 600
  });
});


/**
 * Logout dengan mencabut refresh token.
 */
app.post("/auth/logout", (req, res) => {
  const endpoint = "/auth/logout";
  const { refreshToken } = req.body || {};
  const deviceId = req.get("X-Device-ID");

  if (
    typeof refreshToken !== "string" ||
    !refreshToken ||
    !deviceId
  ) {
    writeAudit(
      "unknown",
      endpoint,
      deviceId,
      "deny",
      "Refresh token atau X-Device-ID tidak lengkap"
    );

    return res.status(400).json({
      error: "Refresh token dan X-Device-ID wajib diisi."
    });
  }

  const tokenHash = hashToken(refreshToken);

  const storedToken = db.prepare(`
    SELECT
      refresh_tokens.id,
      refresh_tokens.user_id,
      users.username,
      users.aktif
    FROM refresh_tokens
    JOIN users ON users.id = refresh_tokens.user_id
    WHERE refresh_tokens.token_hash = ?
      AND refresh_tokens.revoked = 0
  `).get(tokenHash);

  if (!storedToken || !storedToken.aktif) {
    writeAudit(
      "unknown",
      endpoint,
      deviceId,
      "deny",
      "Refresh token tidak valid atau sudah dicabut"
    );

    return res.status(401).json({
      error: "Refresh token tidak valid atau sudah dicabut."
    });
  }

  const device = db.prepare(`
    SELECT id
    FROM devices
    WHERE user_id = ?
      AND device_id = ?
      AND aktif = 1
  `).get(storedToken.user_id, deviceId);

  if (!device) {
    writeAudit(
      storedToken.username,
      endpoint,
      deviceId,
      "deny",
      "Perangkat tidak terdaftar atau tidak aktif"
    );

    return res.status(403).json({
      error: "Perangkat tidak terdaftar untuk akun ini."
    });
  }

  db.prepare(`
    UPDATE refresh_tokens
    SET revoked = 1
    WHERE id = ?
  `).run(storedToken.id);

  writeAudit(
    storedToken.username,
    endpoint,
    deviceId,
    "allow",
    "Logout berhasil; refresh token dicabut"
  );

  return res.json({
    message: "Logout berhasil. Refresh token telah dicabut."
  });
});


/**
 * Menerbitkan token khusus untuk komunikasi antarlayanan.
 * Token hanya diberikan jika client ID dan secret valid.
 */
app.post("/auth/service", (req, res) => {
  const endpoint = "/auth/service";
  const { clientId, clientSecret } = req.body || {};

  if (
    typeof clientId !== "string" ||
    typeof clientSecret !== "string" ||
    !clientId ||
    !clientSecret
  ) {
    writeAudit(
      "service",
      endpoint,
      null,
      "deny",
      "Client ID atau client secret tidak lengkap"
    );

    return res.status(400).json({
      error: "Client ID dan client secret wajib diisi."
    });
  }

  const configuredClientId = process.env.SERVICE_CLIENT_ID;
  const configuredClientSecret = process.env.SERVICE_CLIENT_SECRET;

  if (
    !configuredClientId ||
    !configuredClientSecret ||
    clientId !== configuredClientId ||
    clientSecret !== configuredClientSecret
  ) {
    writeAudit(
      clientId,
      endpoint,
      null,
      "deny",
      "Kredensial service tidak valid"
    );

    return res.status(401).json({
      error: "Kredensial service tidak valid."
    });
  }

  const serviceToken = jwt.sign(
    { role: "service" },
    JWT_SECRET,
    {
      subject: "service-nilai",
      expiresIn: "5m",
      algorithm: "HS256"
    }
  );

  writeAudit(
    "service-nilai",
    endpoint,
    null,
    "allow",
    "Service token berhasil diterbitkan"
  );

  return res.json({
    message: "Service token berhasil diterbitkan.",
    accessToken: serviceToken,
    tokenType: "Bearer",
    expiresIn: 300
  });
});

app.get("/auth/me", authenticateToken, verifyDevice, (req, res) => {
  res.json({
    message: "Access token valid.",
    user: req.user,
  });
});
 

app.get(
  "/test/admin",
  authenticateToken,
  allowRoles("admin"),
  (req, res) => {
    res.json({
      message: "Akses admin diizinkan.",
      user: req.user,
    });
  }
);

app.get(
  "/test/dosen",
  authenticateToken,
  allowRoles("dosen"),
  (req, res) => {
    res.json({
      message: "Akses dosen diizinkan.",
      user: req.user,
    });
  }
);

app.get(
  "/test/mahasiswa",
  authenticateToken,
  allowRoles("mahasiswa"),
  (req, res) => {
    res.json({
      message: "Akses mahasiswa diizinkan.",
      user: req.user,
    });
  }
);



const nilaiProxy = createProxyMiddleware({
  target: "http://localhost:3001",
  changeOrigin: true,

  pathRewrite: (path, req) => req.originalUrl,

  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.setHeader(
        "X-Gateway-Secret",
        process.env.GATEWAY_SECRET
      );

      // Teruskan kembali body JSON yang sudah dibaca Express.
      if (
        req.body &&
        ["POST", "PUT", "PATCH"].includes(req.method) &&
        Object.keys(req.body).length > 0
      ) {
        const bodyData = JSON.stringify(req.body);

        proxyReq.setHeader(
          "Content-Type",
          "application/json"
        );
        proxyReq.setHeader(
          "Content-Length",
          Buffer.byteLength(bodyData)
        );

        proxyReq.write(bodyData);
      }
    }
  }
});

// Semua permintaan /nilai melewati pemeriksaan token
// sebelum diteruskan ke Service Nilai.
app.use("/nilai", authenticateToken, verifyDevice, nilaiProxy);


const kelasProxy = createProxyMiddleware({
  target: "http://localhost:3001",
  changeOrigin: true,

  pathRewrite: (path, req) => req.originalUrl,

  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.setHeader(
        "X-Gateway-Secret",
        process.env.GATEWAY_SECRET
      );
    }
  }
});

app.use(
  "/kelas",
  authenticateToken,
  verifyDevice,
  kelasProxy
);



const transkripProxy = createProxyMiddleware({
  target: "http://localhost:3002",
  changeOrigin: true,

  pathRewrite: (path, req) => req.originalUrl,

  on: {
    proxyReq: (proxyReq, req) => {
      proxyReq.setHeader(
        "X-Gateway-Secret",
        process.env.GATEWAY_SECRET
      );

      // Meneruskan body JSON yang sudah dibaca Express.
      if (
        req.body &&
        ["POST", "PUT", "PATCH"].includes(req.method) &&
        Object.keys(req.body).length > 0
      ) {
        const bodyData = JSON.stringify(req.body);

        proxyReq.setHeader("Content-Type", "application/json");
        proxyReq.setHeader(
          "Content-Length",
          Buffer.byteLength(bodyData)
        );

        proxyReq.write(bodyData);
      }
    }
  }
});

// Rute khusus sinkronisasi untuk komunikasi antarlayanan.
// Harus diletakkan sebelum middleware pengguna /transkrip.
app.post("/transkrip/sinkron", transkripProxy);

// Rute transkrip untuk pengguna tetap memerlukan token
// pengguna dan perangkat yang sudah terdaftar.
app.use(
  "/transkrip",
  authenticateToken,
  verifyDevice,
  transkripProxy
);


// Jalankan gateway
app.listen(PORT, () => {
  console.log(`API Gateway berjalan di http://localhost:${PORT}`);
});
