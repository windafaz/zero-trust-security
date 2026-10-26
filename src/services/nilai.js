
require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../database/database");

const app = express();
const PORT = 3001;

app.use(express.json());

// Middleware untuk memeriksa identitas gateway dan access token.
function verifyGatewayAndToken(req, res, next) {
  const gatewaySecret = req.get("X-Gateway-Secret");

  if (
    !gatewaySecret ||
    gatewaySecret !== process.env.GATEWAY_SECRET
  ) {
    return res.status(403).json({
      error: "Akses ditolak.",
      reason: "Gateway secret tidak valid."
    });
  }

  const authorization = req.get("Authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Access token wajib disertakan."
    });
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    req.user = {
      id: Number(payload.sub),
      role: payload.role
    };

    next();
  } catch (error) {
    return res.status(401).json({
      error: "Access token tidak valid atau sudah kedaluwarsa."
    });
  }
}

// Memeriksa apakah waktu akses berada di antara pukul 07.00–21.00.
function isAccessTimeAllowed() {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 21;
}

// Memeriksa kelas yang diajar oleh dosen.
function isLecturerOfClass(lecturerId, classId) {
  const kelas = db.prepare(`
    SELECT id
    FROM kelas
    WHERE id = ? AND dosen_id = ?
  `).get(classId, lecturerId);

  return Boolean(kelas);
}

// Halaman pemeriksaan Service Nilai.
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Service Nilai",
    port: PORT
  });
});

// Melihat nilai sesuai hak akses pengguna.
app.get("/nilai", verifyGatewayAndToken, (req, res) => {
  const { id: userId, role } = req.user;

  if (!["mahasiswa", "dosen", "admin"].includes(role)) {
    return res.status(403).json({
      error: "Role tidak memiliki izin melihat nilai."
    });
  }

  let rows;

  if (role === "mahasiswa") {
    rows = db.prepare(`
      SELECT
        nilai.id,
        kelas.kode_kelas,
        kelas.nama_kelas,
        nilai.nilai_angka,
        nilai.nilai_huruf,
        nilai.finalized
      FROM nilai
      JOIN kelas ON kelas.id = nilai.kelas_id
      WHERE nilai.mahasiswa_id = ?
    `).all(userId);
  } else if (role === "dosen") {
    rows = db.prepare(`
      SELECT
        nilai.id,
        mahasiswa.nim,
        mahasiswa.nama,
        kelas.kode_kelas,
        kelas.nama_kelas,
        nilai.nilai_angka,
        nilai.nilai_huruf,
        nilai.finalized
      FROM nilai
      JOIN users AS mahasiswa
        ON mahasiswa.id = nilai.mahasiswa_id
      JOIN kelas ON kelas.id = nilai.kelas_id
      WHERE kelas.dosen_id = ?
    `).all(userId);
  } else {
    rows = db.prepare(`
      SELECT
        nilai.id,
        mahasiswa.nim,
        mahasiswa.nama,
        kelas.kode_kelas,
        kelas.nama_kelas,
        nilai.nilai_angka,
        nilai.nilai_huruf,
        nilai.finalized
      FROM nilai
      JOIN users AS mahasiswa
        ON mahasiswa.id = nilai.mahasiswa_id
      JOIN kelas ON kelas.id = nilai.kelas_id
    `).all();
  }

  res.json({
    jumlah: rows.length,
    data: rows
  });
});

// Mengubah nilai: hanya dosen pengampu, sebelum finalisasi,
// dan pada jam akses yang diizinkan.
app.put("/nilai/:id", verifyGatewayAndToken, (req, res) => {
    console.log("Request PUT diterima:", req.method, req.originalUrl);
  const { id: userId, role } = req.user;
  const nilaiId = Number(req.params.id);
  const { nilai_angka, nilai_huruf } = req.body || {};

  if (role !== "dosen") {
    return res.status(403).json({
      error: "Hanya dosen yang dapat mengubah nilai."
    });
  }

  if (
    !Number.isInteger(nilaiId) ||
    nilaiId <= 0 ||
    typeof nilai_angka !== "number" ||
    nilai_angka < 0 ||
    nilai_angka > 100 ||
    typeof nilai_huruf !== "string" ||
    nilai_huruf.trim() === ""
  ) {
    return res.status(400).json({
      error: "ID atau format nilai tidak valid."
    });
  }

  if (!isAccessTimeAllowed()) {
    return res.status(403).json({
      error: "Perubahan nilai hanya diizinkan pukul 07.00–21.00."
    });
  }

  const nilai = db.prepare(`
    SELECT id, kelas_id, finalized
    FROM nilai
    WHERE id = ?
  `).get(nilaiId);

  if (!nilai) {
    return res.status(404).json({
      error: "Data nilai tidak ditemukan."
    });
  }

  if (!isLecturerOfClass(userId, nilai.kelas_id)) {
    return res.status(403).json({
      error: "Dosen tidak mengampu kelas dari nilai tersebut."
    });
  }

  if (nilai.finalized) {
    return res.status(403).json({
      error: "Nilai sudah difinalisasi dan tidak dapat diubah."
    });
  }

  db.prepare(`
    UPDATE nilai
    SET nilai_angka = ?, nilai_huruf = ?
    WHERE id = ?
  `).run(nilai_angka, nilai_huruf.trim(), nilaiId);

  res.json({
    message: "Nilai berhasil diperbarui.",
    id: nilaiId,
    nilai_angka,
    nilai_huruf: nilai_huruf.trim()
  });
});


/**
 * Finalisasi nilai untuk satu kelas.
 * Hanya dosen pengampu yang dapat melakukan finalisasi,
 * dan hanya pada jam akses 07.00–21.00.
 */

/**
 * Finalisasi nilai satu kelas dan sinkronisasi ke transkrip.
 */
app.post(
  "/kelas/:id/finalisasi",
  verifyGatewayAndToken,
  async (req, res) => {
    const { id: userId, role } = req.user;
    const kelasId = Number(req.params.id);

    if (role !== "dosen") {
      return res.status(403).json({
        error: "Hanya dosen yang dapat memfinalisasi nilai."
      });
    }

    if (!Number.isInteger(kelasId) || kelasId <= 0) {
      return res.status(400).json({
        error: "ID kelas tidak valid."
      });
    }

    if (!isAccessTimeAllowed()) {
      return res.status(403).json({
        error: "Finalisasi nilai hanya diizinkan pukul 07.00–21.00."
      });
    }

    const kelas = db.prepare(`
      SELECT id, kode_kelas, nama_kelas, dosen_id
      FROM kelas
      WHERE id = ?
    `).get(kelasId);

    if (!kelas) {
      return res.status(404).json({
        error: "Kelas tidak ditemukan."
      });
    }

    if (kelas.dosen_id !== userId) {
      return res.status(403).json({
        error: "Dosen tidak mengampu kelas tersebut."
      });
    }

    // Pastikan ada nilai yang bisa difinalisasi.
    const nilaiBelumFinal = db.prepare(`
      SELECT COUNT(*) AS jumlah
      FROM nilai
      WHERE kelas_id = ?
        AND finalized = 0
        AND nilai_angka IS NOT NULL
        AND nilai_huruf IS NOT NULL
    `).get(kelasId);

    if (nilaiBelumFinal.jumlah === 0) {
      return res.status(400).json({
        error: "Tidak ada nilai yang siap difinalisasi."
      });
    }

    // Finalisasi hanya nilai yang sudah lengkap.
    db.prepare(`
      UPDATE nilai
      SET finalized = 1
      WHERE kelas_id = ?
        AND finalized = 0
        AND nilai_angka IS NOT NULL
        AND nilai_huruf IS NOT NULL
    `).run(kelasId);

    try {
      // Minta token khusus untuk Service Nilai.
      const tokenResponse = await fetch(
        "http://localhost:3000/auth/service",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            clientId: process.env.SERVICE_CLIENT_ID,
            clientSecret: process.env.SERVICE_CLIENT_SECRET
          })
        }
      );

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.accessToken) {
        throw new Error("Gagal mendapatkan service token.");
      }

      // Kirim permintaan sinkronisasi melalui API Gateway.
      const syncResponse = await fetch(
        "http://localhost:3000/transkrip/sinkron",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenData.accessToken}`
          },
          body: JSON.stringify({
            kelas_id: kelasId
          })
        }
      );

      const syncData = await syncResponse.json();

      if (!syncResponse.ok) {
        console.error("Sinkronisasi gagal:", syncData);

        return res.status(502).json({
          message: "Nilai berhasil difinalisasi, tetapi sinkronisasi transkrip gagal.",
          kelas: kelas.kode_kelas,
          sinkronisasi: "gagal",
          detail: syncData
        });
      }

      return res.json({
        message: "Finalisasi dan sinkronisasi nilai berhasil.",
        kelas: kelas.kode_kelas,
        sinkronisasi: "berhasil",
        jumlah_nilai_difinalisasi: nilaiBelumFinal.jumlah,
        hasil_sinkronisasi: syncData
      });
    } catch (error) {
      console.error("Kesalahan sinkronisasi:", error.message);

      return res.status(502).json({
        message: "Nilai berhasil difinalisasi, tetapi sinkronisasi transkrip gagal.",
        kelas: kelas.kode_kelas,
        sinkronisasi: "gagal",
        detail: "Periksa apakah API Gateway dan Service Transkrip sedang berjalan."
      });
    }
  }
);


app.listen(PORT, () => {
  console.log(`Service Nilai berjalan di http://localhost:${PORT}`);
});
