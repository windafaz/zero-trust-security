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

| Komponen | Port | Fungsi |
|---|---:|---|
| API Gateway | 3000 | Pintu masuk API, autentikasi, dan pengaturan akses |
| Service Nilai | 3001 | Pengelolaan nilai dan finalisasi kelas |
| Service Transkrip | 3002 | Pengambilan dan sinkronisasi transkrip |

Ketiga layanan menggunakan database SQLite yang sama untuk menyimpan data yang diperlukan oleh sistem.

## 3. Persyaratan

Pastikan perangkat sudah memiliki Node.js, npm, Visual Studio Code, dan Postman untuk pengujian API.

Periksa instalasi melalui terminal:

```bash
node -v
npm -v
```

## 4. Cara Menjalankan Proyek

### Langkah 1 — Buka folder proyek

```powershell
cd "D:\Tugas KI\zero-trust-security"
```

### Langkah 2 — Instal dependensi

```bash
npm install
```

Pastikan file `.env` sudah tersedia dan berisi konfigurasi yang dibutuhkan aplikasi, termasuk secret JWT, gateway, serta kredensial service sesuai kode proyek. Jangan membagikan nilai secret tersebut.

### Langkah 3 — Siapkan database

Database disimpan di `src/database/zero-trust.db`.

Jika database belum tersedia, jalankan skrip inisialisasi dan seed yang ada di proyek sesuai urutan implementasinya. Jangan menjalankan ulang seed sebelum memastikan dampaknya terhadap data yang sudah ada.

### Langkah 4 — Jalankan API Gateway

Buka terminal pertama:

```bash
node src/gateway/gateway.js
```

API Gateway berjalan pada port `3000`.

### Langkah 5 — Jalankan Service Nilai

Buka terminal kedua:

```bash
node src/services/nilai.js
```

Service Nilai berjalan pada port `3001`.

### Langkah 6 — Jalankan Service Transkrip

Buka terminal ketiga:

```bash
node src/services/transkrip.js
```

Service Transkrip berjalan pada port `3002`.

**Penting:** ketiga terminal harus tetap berjalan selama pengujian API berlangsung.

## 5. Daftar Akun Pengujian

| Peran | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin123!` |
| Dosen | `dosen.andi` | `Dosen123!` |
| Dosen | `dosen.budi` | `Dosen123!` |
| Mahasiswa | `mhs001` | `Mhs123!` |
| Mahasiswa | `mhs002` | `Mhs123!` |
| Mahasiswa | `mhs003` | `Mhs123!` |

Akun tersebut merupakan akun pengujian lokal. Jika login gagal, periksa kembali data seed dan database yang digunakan.

## 6. Daftar Device ID

Setiap pengguna harus menyertakan header `X-Device-ID` yang terdaftar dan aktif pada endpoint yang memerlukan autentikasi.

| Username | Device ID |
|---|---|
| `admin` | `DEVICE-ADMIN-001` |
| `dosen.andi` | `DEVICE-DOSEN-001` |
| `dosen.budi` | `DEVICE-DOSEN-002` |
| `mhs001` | `DEVICE-MHS-001` |
| `mhs002` | `DEVICE-MHS-002` |
| `mhs003` | `DEVICE-MHS-003` |

Contoh header Postman:

```text
X-Device-ID: DEVICE-MHS-001
```

Gunakan device ID sesuai akun yang sedang digunakan.

## 7. Data Awal Kelas dan Nilai

| Kode Kelas | Nama Kelas | Dosen Pengampu |
|---|---|---|
| IF401 | Keamanan Informasi | `dosen.andi` |
| IF402 | Sistem Informasi | `dosen.budi` |

Data nilai yang telah ditampilkan oleh endpoint `GET /nilai`:

| ID Nilai | NIM | Kelas | Nilai Angka | Nilai Huruf |
|---:|---|---|---:|---|
| 1 | 1001 | IF401 | 88 | A |
| 3 | 1002 | IF401 | 85 | A |
| 5 | 1003 | IF401 | 90 | A |
| 2 | 1001 | IF402 | 80 | B |
| 4 | 1002 | IF402 | 85 | A |
| 6 | 1003 | IF402 | 90 | A |

Pada pemeriksaan terakhir, seluruh nilai pada kedua kelas sudah difinalisasi. **ID nilai berbeda dengan ID kelas.** Periksa tabel `kelas` di database untuk mengetahui ID kelas yang tepat.

## 8. Pengujian API dengan Postman

Alamat dasar API Gateway:

`http://localhost:3000`

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/auth/login` | Login pengguna |
| POST | `/auth/refresh` | Memperbarui access token |
| POST | `/auth/logout` | Mencabut refresh token |
| GET | `/auth/me` | Memeriksa identitas pengguna |
| GET | `/nilai` | Mengambil data nilai sesuai hak akses |
| PUT | `/nilai/:id` | Mengubah nilai sesuai kebijakan |
| POST | `/kelas/:id/finalisasi` | Finalisasi kelas |
| GET | `/transkrip/:nim` | Mengambil transkrip berdasarkan NIM |
| POST | `/transkrip/sinkron` | Sinkronisasi nilai final ke transkrip |

Sesuaikan endpoint dengan implementasi akhir pada kode proyek.

### Contoh Login

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

Gunakan `accessToken` dari respons login sebagai Bearer Token untuk request berikutnya. Sertakan juga `X-Device-ID` yang sesuai.

## 9. Skenario Pengujian Keamanan

1. Login menggunakan akun yang valid.
2. Mengakses endpoint tanpa access token.
3. Mengakses endpoint menggunakan device ID yang tidak terdaftar.
4. Memastikan mahasiswa tidak dapat melihat transkrip mahasiswa lain.
5. Memastikan dosen hanya dapat mengelola nilai kelas yang menjadi tanggung jawabnya.
6. Memastikan nilai yang sudah difinalisasi tidak dapat diubah.
7. Memastikan finalisasi nilai mengikuti batas waktu yang ditentukan sistem.
8. Memastikan endpoint sinkronisasi transkrip menolak token pengguna biasa.
9. Menguji refresh token dan pencabutan token melalui logout.
10. Memeriksa audit log untuk melihat aktivitas akses yang diizinkan maupun ditolak.

## 10. Catatan Keamanan

- Akun dan device ID dalam README ini digunakan untuk pengujian lokal.
- Jangan menggunakan kata sandi contoh di lingkungan produksi.
- Jangan mengunggah file `.env`, token, atau secret ke repository publik.
- Pastikan database tidak mengandung informasi sensitif sebelum dibagikan.
- Terapkan autentikasi dan otorisasi pada setiap layanan yang relevan.

## 11. Penutup

Proyek ini menerapkan prinsip Zero Trust dengan memverifikasi identitas pengguna, token akses, device ID, dan hak akses sebelum memberikan akses ke layanan. Pemisahan API Gateway, Service Nilai, dan Service Transkrip menunjukkan penerapan kontrol akses pada sistem pengelolaan nilai mahasiswa.
