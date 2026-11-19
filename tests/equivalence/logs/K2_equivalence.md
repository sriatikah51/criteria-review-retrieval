# K2 — Uji kesetaraan dan determinisme

Seluruh angka di bawah berasal dari satu jalan skrip `run_k_sensitivity.ts`
(log lengkap: `_run.log`, ringkasan mesin: `_summary.json`), ditambah dua skrip
verifikasi penyebab (`_check_ties.ts`, `_check_ties2.ts`, log `_check_ties.log`).
Tidak ada label / ground truth yang dibaca, tidak ada model yang dipanggil.

---

## 0. Verifikasi konfigurasi terhadap `config_snapshot` run yang dilaporkan

`evaluation_runs.config_snapshot` untuk kedua commit run
(`431a853…`, `6e4b727…`) hanya ada **satu bentuk**, dipakai 17 run:

```json
{"rrfK": 60, "chunkSize": 3500, "finalTopK": 10, "topKLexical": 10,
 "topKSemantic": 10, "minChunkChars": 30, "minWordLength": 3,
 "chunkingMethod": "structure", "embeddingModel": "google/embeddinggemma-300m",
 "batchBudgetChars": 40000, "ftsConfiguration": "simple", "overlapSentences": 1,
 "embeddingDimension": 768, "maxDocFrequencyRatio": 0.1}
```

| Butir yang diminta | Snapshot run | Status |
|---|---|---|
| 10 dokumen A–J | 10 dokumen di tabel `documents` | cocok |
| 14 kriteria aktif (2–10, 12–16) | `criteria where is_active = true` → 2,3,4,5,6,7,8,9,10,12,13,14,15,16 | cocok |
| 1.729 chunk | `count(*) document_chunks` = **1729** | cocok |
| embeddinggemma-300m, 768 dim | `embeddingModel`, `embeddingDimension` = 768; `vector_dims` tersimpan = 768; chunk tanpa embedding = **0** | cocok |
| pencarian eksak | **tidak ada indeks vektor** pada `document_chunks.embedding` (lihat `_indexes.txt`); `EXPLAIN` menunjukkan `Bitmap Heap Scan` + `Sort` atas `embedding <=> …`, bukan `Index Scan` HNSW/IVFFlat | cocok — eksak, bukan ANN |
| FTS `simple` + `ts_rank_cd` | `ftsConfiguration: "simple"`; SQL memakai `to_tsquery('simple', …)` dan `ts_rank_cd`; indeks `gin (content_tsv)` | cocok |
| max_df 0,10 | `maxDocFrequencyRatio: 0.1` | cocok |
| RRF k = 60 | `rrfK: 60` | cocok |
| chunk 3.500 karakter | `chunkSize: 3500` | cocok |
| minWordLength 3 | `minWordLength: 3` | cocok |
| minChunkChars 30 | `minChunkChars: 30` | cocok |

**Perbedaan yang ditemukan: TIDAK ADA.** Selain itu `DEFAULT_CONFIG` pustaka
juga identik dengan snapshot pada seluruh butir yang sama-sama dimiliki
(`ftsConfiguration` tidak ada di `DEFAULT_CONFIG`; nilai itu ditetapkan di SQL
sisi aplikasi, bukan di konfigurasi pustaka).

---

## a. Kesetaraan K = 10 terhadap peringkat yang dipakai paper

### Sumber peringkat pembanding

Tabel paper (Hit Rate 0,896 hybrid / 0,859 semantic / 0,644 lexical; penyebut
135 kasus yang punya ground truth, dari 140 kasus) dihasilkan oleh
`results-regen-2026-10-22/ten_docs/run_retrieval.ts`. Daftar `chunk_id`-nya
**tidak ada** di `per_case_retrieval_maxdf010.csv` (berkas itu hanya memuat
metrik), melainkan di `_retrieval_raw.json` pada dua kunci:

- `sem` — semantik top-10 per (dokumen, kriteria)
- `hasil` — leksikal dan hibrida top-10 per (max_df, dokumen, kriteria)

Berkas itu **juga** memuat kunci `gt` (ground truth). Kunci tersebut **tidak
dibaca dan tidak disalin**. Yang dipakai hanya `sem` dan `hasil`, dan salinan
bebas-labelnya disimpan sebagai `_paper_rankings.json` supaya dapat diperiksa
ulang tanpa menyentuh berkas aslinya.

Catatan rantai: peringkat `semantic-010-20261011` / `lexical-010-20261011` /
`hybrid-010-20261011` yang tersimpan di tabel `retrieval_eval_results` hanya
mencakup **5 dokumen (70 kasus)**, bukan 140. Tabel itu tidak pernah diisi
untuk dokumen F–J. Karena itu pembanding 140 kasus harus diambil dari
`_retrieval_raw.json`.

### Hasil

| | |
|---|---|
| Kasus dibandingkan | 140 kasus × 3 metode = **420** |
| Daftar `chunk_id` **dan urutannya** identik | **420 dari 420** |
| Berbeda | **0** |

Rincian per metode: semantic 140/140, lexical 140/140, hybrid 140/140.

**Tidak ada satu pun perbedaan**, sehingga tidak ada tabel perbedaan untuk
ditampilkan. Perbandingan dilakukan dengan `JSON.stringify` atas larik
berurutan, jadi urutan ikut diuji, bukan hanya keanggotaan.

### Silang-uji tambahan: lengan tunggal

Lengan `semantic` dan `lexical` di produksi **tidak melewati RRF** — kode
aplikasi memotong peringkat asli retriever (`lib/rag-retrieval.ts:241-244`).
Untuk memastikan ini bukan jalur yang menyimpang dari pustaka, setiap daftar
tunggal juga dilebur dengan `applyRRF` pustaka (satu daftar saja):

> `applyRRF([satu daftar], cfg)` menghasilkan urutan **identik** dengan
> peringkat asli yang dipotong ke K, pada **seluruh 420 kasus × 3 nilai K**.

Jadi hasil lengan tunggal tidak bergantung pada apakah RRF dilewati atau tidak.

---

## b. Ulangan untuk 13 nilai max_df — **dikerjakan, tidak dilewati**

Hanya butuh kueri DB, jadi dijalankan penuh. Nilai yang disapu sama dengan
yang dipakai paper: 0,05 · 0,08 · 0,10 · 0,12 · 0,15 · 0,20 · 0,30 · 0,40 ·
0,50 · 0,60 · 0,80 · 0,95 · 1,00.

Komponen leksikal dibangun ulang dengan **`buildDistinctiveLexicalQuery`
pustaka** (max_df diberikan lewat `maxDocFrequencyRatio` di config pipeline),
dan hibrida dilebur dengan **`applyRRF` pustaka**.

| | |
|---|---|
| Perbandingan | 13 nilai × 140 kasus = **1.820** |
| Leksikal berbeda | **0** |
| Hibrida berbeda | **0** |

Jumlah kasus dengan kueri leksikal kosong juga cocok persis dengan data paper
pada setiap nilai:

| max_df | 0,05 | 0,08 | 0,10 | 0,12 | 0,15 | 0,20 | 0,30 | ≥ 0,40 |
|---|---|---|---|---|---|---|---|---|
| kueri kosong (jalan ini) | 62 | 22 | **15** | 6 | 5 | 2 | 1 | 0 |
| kueri kosong (data paper) | 62 | 22 | **15** | 6 | 5 | 2 | 1 | 0 |

Keluaran lengkap: `K2_maxdf_sweep.csv` (3.640 baris = 1.820 × 2 metode).

---

## c. Deteksi nondeterminisme

Langkah 1 untuk K = 10 dijalankan **dua kali berurutan dalam satu proses**,
termasuk **pemanggilan ulang layanan embedding** untuk ke-14 kriteria (jadi
yang diuji bukan hanya kueri DB, tetapi juga stabilitas embedding kueri).

| | |
|---|---|
| Vektor embedding 14 kriteria | **identik bit-per-bit** (sha256 16 heksa pertama `a66ac78fc23dc8bc` pada kedua jalan) |
| Kueri leksikal (`tsquery`) | identik pada 140/140 kasus |
| Peringkat berbeda | **0 dari 420** (140 kasus × 3 metode) |

**Retrieval pustaka deterministik** pada data dan basis data ini. Tidak ada
tempat yang perlu ditampilkan karena tidak ada perbedaan.

Batas klaim: ini menguji dua jalan berurutan pada satu mesin, satu proses
Postgres, dan satu proses `extraction-service` yang sama. Determinisme lintas
mesin, lintas versi model embedding, atau setelah `ANALYZE`/perubahan rencana
kueri **tidak** diuji di sini.

---

## Tambahan (BUKAN bagian uji kesetaraan): peringkat tidak bersarang terhadap K

Temuan ini muncul dari `K1_rankings.csv` sendiri dan penting untuk membaca
analisis sensitivitas K, jadi dicatat terpisah agar tidak tertukar dengan
hasil uji kesetaraan di atas.

Pertanyaannya: apakah 10 teratas pada K = 20 sama dengan daftar pada K = 10?

| metode | `K=20`, 10 teratas == `K=10` (urutan) |
|---|---|
| semantic | **140 / 140** |
| lexical | **88 / 140** |
| hybrid | **31 / 140** (sama sebagai himpunan: 57 / 140) |

Lengan semantik bersarang sempurna, sebagaimana diharapkan dari pengurutan
jarak `<=>` yang nilainya hampir selalu unik.

Lengan leksikal **tidak** bersarang: 52 kasus berubah. Penyebabnya diperiksa
langsung terhadap skor `ts_rank_cd`, bukan disimpulkan:

| | |
|---|---|
| Kasus berbeda | 52 |
| Himpunan BERBEDA, **dan** skor peringkat 10 == skor peringkat 11 (seri di batas) | **37** |
| Himpunan BERBEDA tanpa seri di batas | **0** |
| Himpunan SAMA (hanya urutan berubah), ada seri di batas | 4 |
| Himpunan SAMA (hanya urutan berubah), tanpa seri di batas | 11 |
| Kasus berbeda yang **tidak** punya skor kembar sama sekali di 25 teratas | **0** |

Artinya: **setiap** perubahan keanggotaan disertai seri skor tepat di batas
pemotongan, dan setiap kasus yang berubah memang mengandung skor kembar.
Skor `ts_rank_cd` sangat kasar — pada contoh yang diperiksa hanya ada 5–9 nilai
skor unik di antara 22–25 chunk yang cocok (mis. `A/2`: 5 nilai unik untuk 22
chunk). `ORDER BY … LIMIT n` di PostgreSQL tidak menjanjikan urutan tertentu di
antara baris berskor sama, sehingga nilai `n` yang berbeda dapat memilih baris
seri yang berbeda.

Ini **bukan** nondeterminisme (jalan yang diulang dengan `LIMIT` yang sama
memberi hasil identik — lihat c), melainkan ketergantungan pemecahan seri pada
nilai `LIMIT`. Dua konsekuensi yang perlu disebut di paper:

1. Kenaikan K **tidak** semata menambah kandidat pada lengan leksikal; ia juga
   dapat mengganti anggota 10 teratas. Perbandingan antar-K pada lengan
   leksikal dan hibrida karena itu bukan perbandingan "himpunan yang sama,
   ditambah ekor".
2. Urutan hibrida ikut berubah karena masukan leksikalnya berubah, di atas
   perubahan yang wajar akibat RRF melebur kolam yang lebih besar. Kedua sebab
   itu **tidak dipisahkan** di sini.

Catatan ukuran daftar yang relevan untuk sensitivitas K: lengan leksikal sering
mengembalikan kurang dari K karena `tsquery`-nya memang cocok ke sedikit chunk.

| K | kasus dengan daftar leksikal penuh K | kurang dari K | kosong (kueri null) |
|---|---|---|---|
| 5 | 117 / 140 | 23 | 15 |
| 10 | 97 / 140 | 43 | 15 |
| 20 | 56 / 140 | 84 | 15 |

Lengan semantik dan hibrida selalu penuh K pada ketiga nilai K (140/140), sebab
semantik selalu dapat memasok K kandidat. Pada 15 kasus berkueri-kosong,
hibrida **identik** dengan semantik — hibrida jatuh ke semantik murni di situ.
