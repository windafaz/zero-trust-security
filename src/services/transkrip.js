
require("dotenv").config();

const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../database/database");

const app = express();
const PORT = 3002;

app.use(express.json());

// Memastikan request berasal dari API Gateway
// dan access token masih valid.
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
      error: "Token wajib disertakan."
    });
  }

  try {
    const payload = jwt.verify(
      authorization.slice(7),
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    req.user = {
      id: Number(payload.sub),
      role: payload.role
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Token tidak valid atau sudah kedaluwarsa."
    });
  }
}

// Pemeriksaan status Service Transkrip.
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Service Transkrip",
    port: PORT
  });
});

// Sinkronisasi nilai final.
// Endpoint ini hanya boleh dipanggil oleh Service Nilai
// menggunakan token khusus dengan role service.
app.post(
  "/transkrip/sinkron",
  verifyGatewayAndToken,
  (req, res) => {
    if (req.user.role !== "service") {
      return res.status(403).json({
        error: "Hanya service yang boleh melakukan sinkronisasi."
      });
    }

    const { kelas_id } = req.body;

    if (!Number.isInteger(kelas_id) || kelas_id <= 0) {
      return res.status(400).json({
        error: "kelas_id wajib berupa bilangan bulat positif."
      });
    }

    const kelas = db.prepare(`
      SELECT id, kode_kelas
      FROM kelas
      WHERE id = ?
    `).get(kelas_id);

    if (!kelas) {
      return res.status(404).json({
        error: "Kelas tidak ditemukan."
      });
    }

    // Ambil hanya nilai yang sudah difinalisasi.
    const nilaiFinal = db.prepare(`
      SELECT
        mahasiswa_id,
        kelas_id,
        nilai_angka,
        nilai_huruf
      FROM nilai
      WHERE kelas_id = ?
        AND finalized = 1
        AND nilai_angka IS NOT NULL
        AND nilai_huruf IS NOT NULL
    `).all(kelas_id);

    // Simpan atau perbarui nilai final ke tabel transkrip.
    const upsertTranskrip = db.prepare(`
      INSERT INTO transkrip (
        mahasiswa_id,
        kelas_id,
        nilai_angka,
        nilai_huruf,
        updated_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(mahasiswa_id, kelas_id)
      DO UPDATE SET
        nilai_angka = excluded.nilai_angka,
        nilai_huruf = excluded.nilai_huruf,
        updated_at = CURRENT_TIMESTAMP
    `);

    const sinkronisasi = db.transaction((data) => {
      for (const item of data) {
        upsertTranskrip.run(
          item.mahasiswa_id,
          item.kelas_id,
          item.nilai_angka,
          item.nilai_huruf
        );
      }
    });

    try {
      sinkronisasi(nilaiFinal);

      return res.json({
        message: "Sinkronisasi transkrip berhasil.",
        kelas: kelas.kode_kelas,
        jumlah: nilaiFinal.length
      });
    } catch (error) {
      console.error("Gagal sinkronisasi transkrip:", error);

      return res.status(500).json({
        error: "Terjadi kesalahan saat sinkronisasi transkrip."
      });
    }
  }
);

// Melihat transkrip:
// mahasiswa hanya boleh melihat transkrip sendiri,
// sedangkan admin boleh melihat semua mahasiswa.
app.get(
  "/transkrip/:nim",
  verifyGatewayAndToken,
  (req, res) => {
    const { id: userId, role } = req.user;
    const nim = req.params.nim;

    if (!["mahasiswa", "admin"].includes(role)) {
      return res.status(403).json({
        error: "Role tidak memiliki izin melihat transkrip."
      });
    }

    const mahasiswa = db.prepare(`
      SELECT id, nim, nama
      FROM users
      WHERE nim = ? AND role = 'mahasiswa'
    `).get(nim);

    if (!mahasiswa) {
      return res.status(404).json({
        error: "Mahasiswa tidak ditemukan."
      });
    }

    if (role === "mahasiswa" && mahasiswa.id !== userId) {
      return res.status(403).json({
        error: "Mahasiswa hanya boleh melihat transkrip sendiri."
      });
    }

    const nilai = db.prepare(`
      SELECT
        kelas.kode_kelas,
        kelas.nama_kelas,
        transkrip.nilai_angka,
        transkrip.nilai_huruf
      FROM transkrip
      JOIN kelas ON kelas.id = transkrip.kelas_id
      WHERE transkrip.mahasiswa_id = ?
      ORDER BY kelas.kode_kelas
    `).all(mahasiswa.id);

    return res.json({
      mahasiswa: {
        nim: mahasiswa.nim,
        nama: mahasiswa.nama
      },
      jumlah: nilai.length,
      transkrip: nilai
    });
  }
);

app.listen(PORT, () => {
  console.log(`Service Transkrip berjalan di http://localhost:${PORT}`);
});
