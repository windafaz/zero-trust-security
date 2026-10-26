
const db = require("./database");
const bcrypt = require("bcryptjs");

// Data akun awal untuk pengujian
const users = [
  {
    nim: null,
    nama: "Admin Sistem",
    username: "admin",
    password: "Admin123!",
    role: "admin",
    device: "DEVICE-ADMIN-001",
  },
  {
    nim: null,
    nama: "Dosen Andi",
    username: "dosen.andi",
    password: "Dosen123!",
    role: "dosen",
    device: "DEVICE-DOSEN-001",
  },
  {
    nim: null,
    nama: "Dosen Budi",
    username: "dosen.budi",
    password: "Dosen123!",
    role: "dosen",
    device: "DEVICE-DOSEN-002",
  },
  {
    nim: "1001",
    nama: "Mahasiswa Satu",
    username: "mhs001",
    password: "Mhs123!",
    role: "mahasiswa",
    device: "DEVICE-MHS-001",
  },
  {
    nim: "1002",
    nama: "Mahasiswa Dua",
    username: "mhs002",
    password: "Mhs123!",
    role: "mahasiswa",
    device: "DEVICE-MHS-002",
  },
  {
    nim: "1003",
    nama: "Mahasiswa Tiga",
    username: "mhs003",
    password: "Mhs123!",
    role: "mahasiswa",
    device: "DEVICE-MHS-003",
  },
];

const insertUser = db.prepare(`
  INSERT INTO users (nim, nama, username, password_hash, role)
  VALUES (@nim, @nama, @username, @password_hash, @role)
`);

const insertDevice = db.prepare(`
  INSERT INTO devices (user_id, device_id)
  VALUES (?, ?)
`);

const insertClass = db.prepare(`
  INSERT INTO kelas (kode_kelas, nama_kelas, dosen_id)
  VALUES (?, ?, ?)
`);

const insertGrade = db.prepare(`
  INSERT INTO nilai (mahasiswa_id, kelas_id, nilai_angka, nilai_huruf)
  VALUES (?, ?, ?, ?)
`);

const seed = db.transaction(() => {
  for (const user of users) {
    const existing = db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(user.username);

    let userId;

    if (existing) {
      userId = existing.id;
    } else {
      const result = insertUser.run({
        nim: user.nim,
        nama: user.nama,
        username: user.username,
        password_hash: bcrypt.hashSync(user.password, 10),
        role: user.role,
      });

      userId = Number(result.lastInsertRowid);
    }

    const deviceExists = db
      .prepare(
        "SELECT id FROM devices WHERE user_id = ? AND device_id = ?"
      )
      .get(userId, user.device);

    if (!deviceExists) {
      insertDevice.run(userId, user.device);
    }
  }

  // Membuat dua kelas dengan dosen pengampu berbeda
  const dosenAndi = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get("dosen.andi");

  const dosenBudi = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get("dosen.budi");

  const kelasData = [
    {
      kode: "IF401",
      nama: "Keamanan Informasi",
      dosenId: dosenAndi.id,
    },
    {
      kode: "IF402",
      nama: "Sistem Informasi",
      dosenId: dosenBudi.id,
    },
  ];

  for (const kelas of kelasData) {
    const exists = db
      .prepare("SELECT id FROM kelas WHERE kode_kelas = ?")
      .get(kelas.kode);

    if (!exists) {
      insertClass.run(kelas.kode, kelas.nama, kelas.dosenId);
    }
  }

  // Membuat nilai awal untuk setiap mahasiswa pada kedua kelas
  const mahasiswa = db
    .prepare("SELECT id, username FROM users WHERE role = 'mahasiswa'")
    .all();

  const kelasList = db.prepare("SELECT id FROM kelas").all();

  for (const mhs of mahasiswa) {
    for (const kelas of kelasList) {
      const gradeExists = db
        .prepare(
          "SELECT id FROM nilai WHERE mahasiswa_id = ? AND kelas_id = ?"
        )
        .get(mhs.id, kelas.id);

      if (!gradeExists) {
        const angka = 75 + (Number(mhs.username.slice(-1)) * 5);

        const huruf =
          angka >= 85 ? "A" :
          angka >= 80 ? "B" :
          angka >= 70 ? "C" : "D";

        insertGrade.run(mhs.id, kelas.id, angka, huruf);
      }
    }
  }
});

seed();

console.log("Data awal berhasil disiapkan.");
console.log("Jumlah pengguna:", db.prepare("SELECT COUNT(*) AS total FROM users").get().total);
console.log("Jumlah kelas:", db.prepare("SELECT COUNT(*) AS total FROM kelas").get().total);
console.log("Jumlah data nilai:", db.prepare("SELECT COUNT(*) AS total FROM nilai").get().total);

db.close();
