# Zero Trust Security — Sistem Nilai

Proyek praktikum Keamanan Informasi yang menerapkan konsep **Zero Trust Security** pada sistem pengelolaan nilai mahasiswa. Setiap permintaan akses perlu melalui verifikasi identitas, token, perangkat, dan hak akses sesuai peran pengguna.

## 1. Teknologi yang Digunakan

- Node.js
- Express.js
- SQLite
- JSON Web Token (JWT)
- bcryptjs
- http-proxy-middleware

## 2. Arsitektur Sistem

Sistem terdiri dari tiga layanan utama:

| Komponen | Port | Fungsi |
|---|---:|---|
| API Gateway | 3000 | Pintu masuk API, autentikasi, dan pengaturan akses |
| Service Nilai | 3001 | Pengelolaan nilai dan finalisasi kelas |
| Service Transkrip | 3002 | Pengambilan dan sinkronisasi transkrip |

Ketiga layanan menggunakan database SQLite yang sama untuk menyimpan data yang diperlukan oleh sistem.

## 3. Persyaratan

Pastikan perangkat sudah memiliki:

- Node.js dan npm
- Visual Studio Code
- Postman untuk pengujian API

Periksa instalasi melalui terminal:

```bash
node -v
npm -v
```

## 4. Cara Menjalankan Proyek

### Langkah 1 — Buka folder proyek

Buka terminal PowerShell dan masuk ke folder proyek:

```powershell
cd "D:\Tugas KI\zero-trust-security"
```

### Langkah 2 — Instal dependensi

Jika dependensi belum terpasang, jalankan:

```bash
npm install
```

Pastikan file `.env` sudah tersedia dan berisi konfigurasi yang dibutuhkan aplikasi, termasuk secret JWT dan gateway serta kredensial service sesuai nama variabel yang digunakan di kode. Jangan membagikan nilai secret tersebut.

### Langkah 3 — Siapkan database

Database disimpan di:

```text
src/database/zero-trust.db
```

Jika database belum dibuat atau perlu diinisialisasi, jalankan skrip database dan seed yang tersedia di proyek sesuai urutan implementasinya. Jangan menjalankan ulang proses seed pada database yang sudah berisi data tanpa memeriksa apakah skrip tersebut menambahkan atau mengatur ulang data.

### Langkah 4 — Jalankan API Gateway

Buka terminal pertama:

```bash
node src/gateway/gateway.js
```

API Gateway berjalan pada port `3000`.

### Langkah 5 — Jalankan Service Nilai

Buka terminal kedua pada folder proyek yang sama:

```bash
node src/services/nilai.js
```

Service Nilai berjalan pada port `3001`.

### Langkah 6 — Jalankan Service Transkrip

Buka terminal ketiga pada folder proyek yang sama:

```bash
node src/services/transkrip.js
```

Service Transkrip berjalan pada port `3002`.

**Penting:** ketiga terminal harus tetap berjalan selama pengujian API berlangsung. Jika salah satu layanan dihentikan, endpoint yang bergantung pada layanan tersebut dapat gagal diakses.

## 5. Daftar Akun Pengujian

Berikut akun awal yang digunakan untuk pengujian berdasarkan data seed proyek.

| Peran | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin123!` |
| Dosen | `dosen.andi` | `Dosen123!` |
| Dosen | `dosen.budi` | `Dosen123!` |
| Mahasiswa | `mhs001` | `Mhs123!` |
| Mahasiswa | `mhs002` | `Mhs123!` |
| Mahasiswa | `mhs003` | `Mhs123!` |

Gunakan akun sesuai skenario pengujian. Untuk memastikan nama pengguna dan kata sandi tetap sesuai, periksa kembali file seed dan database proyek jika terjadi kegagalan login.

## 6. Daftar Device ID

Setiap pengguna harus menyertakan `X-Device-ID` yang terdaftar dan aktif saat mengakses endpoint yang membutuhkan autentikasi.

| Username | Device ID |
|---|---|
| `admin` | `DEVICE-ADMIN-001` |
| `dosen.andi` | `DEVICE-DOSEN-001` |
| `dosen.budi` | `DEVICE-DOSEN-002` |
| `mhs001` | `DEVICE-MHS-001` |
| `mhs002` | `DEVICE-MHS-002` |
| `mhs003` | `DEVICE-MHS-003` |

Contoh header pada Postman:

```text
X-Device-ID: DEVICE-MHS-001
```

Gunakan device ID yang sesuai dengan akun yang sedang digunakan. Device ID yang tidak terdaftar atau tidak aktif seharusnya ditolak oleh sistem.

## 7. Data Awal Kelas dan Nilai

Sistem memiliki dua kelas awal:

| Kode Kelas | Nama Kelas | Dosen Pengampu |
|---|---|---|
| IF401 | Keamanan Informasi | `dosen.andi` |
| IF402 | Sistem Informasi | `dosen.budi` |

Data nilai awal yang telah ditampilkan oleh endpoint `GET /nilai`:

| ID Nilai | NIM | Kelas | Nilai Angka | Nilai Huruf |
|---:|---|---|---:|---|
| 1 | 1001 | IF401 | 88 | A |
| 3 | 1002 | IF401 | 85 | A |
| 5 | 1003 | IF401 | 90 | A |
| 2 | 1001 | IF402 | 80 | B |
| 4 | 1002 | IF402 | 85 | A |
| 6 | 1003 | IF402 | 90 | A |

Pada data yang terakhir diperiksa, seluruh nilai di kedua kelas sudah berstatus finalisasi. ID nilai berbeda dengan ID kelas. Untuk mengetahui ID kelas yang benar, periksa tabel `kelas` pada database.

## 8. Pengujian API dengan Postman

Gunakan alamat dasar:

```text
http://localhost:3000
```

Endpoint yang dapat digunakan untuk pengujian meliputi:

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/auth/login` | Login pengguna |
| POST | `/auth/refresh` | Memperbarui access token |
| POST | `/auth/logout` | Mencabut refresh token |
| GET | `/auth/me` | Memeriksa identitas pengguna |
| GET | `/nilai` | Mengambil data nilai sesuai hak akses |
| PUT | `/nilai/:id` | Mengubah nilai sesuai kebijakan |
| POST | `/kelas/:id/finalisasi` | Melakukan finalisasi kelas |
| GET | `/transkrip/:nim` | Mengambil transkrip berdasarkan NIM |
| POST | `/transkrip/sinkron` | Menyinkronkan nilai final ke transkrip |

Rute tersebut perlu disesuaikan dengan implementasi akhir pada kode proyek.

### Contoh login

Request:

```http
POST http://localhost:3000/auth/login
```

Header:

```text
Content-Type: application/json
X-Device-ID: DEVICE-MHS-001
```

Body JSON:

```json
{
  "username": "mhs001",
  "password": "Mhs123!"
}
```

Gunakan `accessToken` dari respons login sebagai Bearer Token untuk request selanjutnya. Sertakan juga `X-Device-ID` yang sesuai.

## 9. Skenario Pengujian Keamanan

Beberapa skenario pengujian yang dapat dilakukan:

1. Login menggunakan akun yang valid.
2. Mengakses endpoint tanpa access token.
3. Mengakses endpoint menggunakan device ID yang tidak terdaftar.
4. Memastikan mahasiswa tidak dapat melihat transkrip mahasiswa lain.
5. Memastikan dosen hanya dapat mengelola nilai kelas yang menjadi tanggung jawabnya.
6. Memastikan nilai yang sudah difinalisasi tidak dapat diubah.
7. Memastikan finalisasi nilai hanya dapat dilakukan pada rentang waktu yang ditentukan sistem.
8. Memastikan endpoint sinkronisasi transkrip menolak token pengguna biasa.
9. Menguji refresh token dan memastikan refresh token yang sudah dicabut tidak dapat digunakan kembali.
10. Memeriksa audit log untuk melihat aktivitas akses yang diizinkan maupun ditolak.

## 10. Catatan Keamanan

- Akun dan device ID di README ini digunakan untuk pengujian lokal.
- Jangan menggunakan kata sandi contoh untuk lingkungan produksi.
- Jangan memasukkan file `.env`, token, atau secret ke repositori publik.
- Jangan membagikan database yang berisi data sensitif tanpa pemeriksaan.
- Pastikan aturan autentikasi dan otorisasi diterapkan pada setiap layanan yang relevan.

## 11. Penutup

Proyek ini menerapkan prinsip Zero Trust dengan memverifikasi identitas pengguna, token akses, device ID, dan hak akses sebelum memberikan akses ke layanan. Pemisahan API Gateway, Service Nilai, dan Service Transkrip membantu menunjukkan penerapan kontrol akses pada sistem pengelolaan nilai mahasiswa.
