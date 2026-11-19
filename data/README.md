# Data studi kasus LAKIN

Anotasi, keluaran model, dan hasil retrieval untuk studi kasus evaluasi Laporan
Kinerja (LAKIN) terhadap 14 kriteria aktif pada 10 dokumen — 140 kasus
dokumen × kriteria.

> **Catatan penyusunan.** Draf `data-README.md` yang disebut dalam instruksi
> penyiapan tidak ditemukan di mana pun, sehingga berkas ini ditulis dari nol.
> Seluruh nama kolom dan jumlah baris di bawah diambil langsung dari berkas yang
> ada di folder ini, bukan dari dokumen lain.

## Struktur

```
reports/          10 laporan LAKIN sumber (PDF), doc_A.pdf .. doc_J.pdf
data/
├── annotations/      label anotator dan ground truth hasil adjudikasi
├── model_outputs/    verdict model dan audit kutipan
├── retrieval/        peringkat retrieval per metode
├── SHA256SUMS.txt    checksum 14 berkas data
└── README.md         berkas ini
```

`reports/` berada di akar repositori, bukan di dalam `data/`.

## Kode dokumen

Kasus diidentifikasi oleh pasangan `document` (huruf **A**–**J**) dan
`criterion` (kode kriteria). Pemetaan huruf ke berkas PDF mengikuti nama berkas:
`A` → `reports/doc_A.pdf`, dan seterusnya.

Pembagian kelompok yang dipakai dalam analisis: **Development** = B, D, E
(42 kasus); **Test** = A, C, F, G, H, I, J (98 kasus).

## annotations/

### `ground_truth_adjudicated.csv` — 140 baris

Label final hasil adjudikasi dua anotator. Inilah label utama analisis.

| kolom | isi |
|---|---|
| `document` | kode dokumen A–J |
| `criterion` | kode kriteria |
| `gt_chunk_ids` | id chunk relevan, dipisah spasi; kosong bila tidak ada bukti |
| `verdict_label` | `ya` / `tidak` |

136 dari 140 baris memiliki `gt_chunk_ids` tidak kosong.

### `ground_truth_chunks_union.csv` — 140 baris

Gabungan himpunan chunk kedua anotator. Kolom sama dengan di atas.
137 baris memiliki chunk.

### `ground_truth_chunks_intersection.csv` — 140 baris

Irisan himpunan chunk kedua anotator. Kolom sama. 128 baris memiliki chunk.

### `annotator_labels.csv` — 140 baris

Label kedua anotator sebelum adjudikasi, beserta hasil akhirnya.

| kolom | isi |
|---|---|
| `document`, `criterion` | identitas kasus |
| `a1_verdict`, `a2_verdict` | verdict anotator 1 dan 2 (`ya` / `tidak`) |
| `verdict_agree` | `true` bila kedua verdict sama |
| `final_verdict` | verdict setelah adjudikasi |
| `a1_chunk_ids`, `a2_chunk_ids` | chunk yang ditandai tiap anotator, dipisah spasi |
| `final_chunk_ids` | chunk pada label final |
| `final_source` | `auto_union` (sepakat dan Jaccard ≥ 0,5) atau `adjudicated` |
| `jaccard` | indeks Jaccard antara kedua himpunan chunk |

Catatan `jaccard`: untuk kasus yang kedua anotatornya sama-sama menyatakan
"tidak ada bukti" (himpunan kosong), nilainya **1** menurut konvensi — dua
himpunan kosong dianggap sepakat penuh — bukan hasil pembagian 0/0.

Kolom `rationale` (catatan bebas adjudikator) **sengaja tidak disertakan**.

### `chunk_index.csv` — 1.729 baris

Pemetaan id chunk ke dokumen, posisi, dan halaman. **Tanpa teks chunk.**

| kolom | isi |
|---|---|
| `chunk_id` | UUID chunk, dipakai di seluruh berkas lain |
| `document` | kode dokumen A–J |
| `chunk_index` | nomor urut chunk dalam dokumen, mulai 0 |
| `page` | nomor halaman fisik PDF |

**Asal kolom `page`.** Halaman tidak tersimpan sebagai bidang tersendiri di mana
pun — baik pada metadata chunk maupun pada tabel basis data. Nilai di sini
**diturunkan dari penanda `[Halaman N]` pertama** yang muncul di dalam teks tiap
chunk; penanda itu adalah definisi halaman yang dipakai pipeline evaluasi
sendiri. **1.729 dari 1.729 chunk memiliki penanda**, jadi tidak ada nilai yang
kosong. Chunk dapat melintasi batas halaman, sehingga nilai ini adalah halaman
tempat chunk dimulai.

## model_outputs/

### `model_verdicts.csv` — 140 baris

Verdict model untuk tiap kasus.

| kolom | isi |
|---|---|
| `document`, `criterion` | identitas kasus |
| `model_verdict` | `ya` / `tidak` |
| `evidence_page` | halaman bukti yang dikutip model; kosong bila tidak ada |
| `code_commit` | hash commit kode saat run dijalankan |
| `model_used` | pengenal model |
| `started_at` | waktu mulai run |

### `quote_audit.csv` — 16 baris

Audit kutipan bukti untuk kasus yang verdict modelnya berbeda dari label.

Kolom: `document`, `criterion`, `label`, `verdict`, `has_quote`, `quote_len`,
`quote_in_context`, `quote_in_other_chunks`, `evidence_page`, `quote`.

### `_detail.json`

Rincian pendukung analisis kesalahan. Objek dengan empat kunci tingkat atas:

| kunci | isi |
|---|---|
| `detail` | objek rincian per kasus |
| `baris16` | larik 10 entri, satu per dokumen, untuk Kriteria 16 — kunci `document`, `label`, `verdict`, `n_ref`, `n_ref_in_context`, `n_context`, `context_mentions_triwulan_i_2026`, `context_mentions_notulen`, `context_mentions_renstra`, `context_mentions_notulen_and_renstra`, `quote` |
| `d61` | objek rincian tambahan |
| `beda` | larik 16 entri kasus berbeda — kunci `dok`, `code`, `label`, `verdict` |

## retrieval/

Hasil per kasus dapat dihitung dari semantic_top50.csv, lexical_top50.csv, top50_bm25_v1..v4.csv, dan annotations/ground_truth_adjudicated.csv.

### `semantic_top50.csv` — 7.000 baris

50 chunk teratas jalur semantik per kasus.
Kolom: `document`, `criterion`, `rank`, `chunk_id`, `chunk_index`, `cosine_distance`.

### `lexical_top50.csv` — 2.586 baris

50 chunk teratas jalur leksikal per kasus.
Kolom: `document`, `criterion`, `rank`, `chunk_id`, `chunk_index`, `ts_rank_cd`.

### `top50_bm25_v1.csv` .. `top50_bm25_v4.csv`

50 chunk teratas empat varian BM25.
Kolom: `document`, `criterion`, `rank`, `chunk_id`.

| berkas | baris |
|---|---|
| `top50_bm25_v1.csv` | 7.000 |
| `top50_bm25_v2.csv` | 2.677 |
| `top50_bm25_v3.csv` | 7.000 |
| `top50_bm25_v4.csv` | 2.479 |

### Mengapa sebagian berkas kurang dari 7.000 baris

140 kasus × 50 peringkat = 7.000 baris bila tiap kasus mengembalikan 50 chunk.
`lexical_top50.csv` (2.586), `top50_bm25_v2.csv` (2.677), dan
`top50_bm25_v4.csv` (2.479) berisi lebih sedikit karena sebagian kasus
**kuerinya kosong** — tidak ada istilah yang lolos penyaring frekuensi dokumen,
sehingga tidak ada baris yang dikembalikan sama sekali — dan sebagian lain
mengembalikan kurang dari 50 chunk yang cocok. Ini **bukan data yang hilang**;
kasus semacam itu tetap ikut penyebut dengan hit = 0 dalam analisis.

## Verifikasi integritas

```
cd data
sha256sum -c SHA256SUMS.txt
```

Diharapkan: 14 berkas OK. `SHA256SUMS.txt` dan `README.md` sendiri tidak
termasuk dalam daftar checksum.

## Keterbukaan identitas dokumen

**Kode dokumen A–J bukan anonimisasi.** Nama unit kerja asli muncul di dalam
`model_outputs/_detail.json` dan `model_outputs/quote_audit.csv`, karena kedua
berkas itu memuat teks dan kutipan dari dokumen sumber. Berkas di `annotations/`
dan `retrieval/` hanya memakai huruf A–J.

Laporan LAKIN adalah dokumen publik, dan 10 PDF sumbernya disertakan di
`reports/`. Pemetaan huruf ke unit kerja karenanya memang dapat ditelusuri dari
berkas PDF itu sendiri.

## Lisensi — usulan, belum final

Usulan berikut **belum ditetapkan** dan menunggu keputusan pemilik repositori:

| bagian | usulan lisensi |
|---|---|
| Kode library (`src/`, `test/`, `tests/`) | MIT, mengikuti `LICENSE` yang sudah ada |
| Laporan LAKIN di `reports/` | tetap milik Badan Pusat Statistik; disertakan sebagai dokumen publik, bukan dilisensikan ulang |
| Anotasi dan hasil analisis di `data/` | CC BY 4.0 |

## Sumber dan sitasi

- **Source URL:** TODO
- **Tanggal akses dokumen LAKIN:** TODO
- **Sitasi:** lihat `CITATION.cff` di akar repositori.
