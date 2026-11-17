# tests/equivalence — bukti bahwa retrieval berjalan lewat kode library

> Folder ini bukan bagian dari suite `npm test`. Ia tidak dijalankan
> oleh CI dan tidak dapat dijalankan tanpa basis data korpus.

## Apa yang dibuktikan

Skrip `run_k_sensitivity.ts` menjalankan retrieval **melalui kode library ini**
(`buildDistinctiveLexicalQuery`, `applyRRF`,
`LakinEvaluationPipeline#retrieveChunksForCriterion`) atas satu korpus 10
dokumen × 14 kriteria (1.729 chunk), untuk K = 5, 10, dan 20 pada tiga metode
(semantic, lexical, hybrid), lalu membandingkan hasilnya dengan peringkat yang
dipakai pada eksperimen yang dilaporkan.

Hasil yang diperoleh pada korpus itu:

| Pemeriksaan                                                                     | Hasil                                                     |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| K = 10 vs peringkat pembanding — 140 kasus × 3 metode                           | **420 / 420 identik**, termasuk urutannya                 |
| Sapuan 13 nilai `maxDocFrequencyRatio` (0,05 … 1,00), lengan leksikal + hibrida | **1.820 perbandingan, 0 berbeda**                         |
| Determinisme: K = 10 dijalankan dua kali berurutan, termasuk embedding ulang    | **0 / 420 berbeda**; vektor embedding identik bit-per-bit |
| `applyRRF([satu daftar])` vs urutan asli retriever yang dipotong ke K           | identik pada seluruh kasus dan ketiga nilai K             |

Pemeriksaan terakhir itu penting untuk membaca lengan tunggal: aplikasi yang
diukur memotong peringkat asli tanpa melewati RRF, dan ini memastikan hasilnya
sama dengan bila RRF dilewatkan.

## Temuan yang perlu diketahui pemakai library

Pada korpus itu, **peringkat lengan leksikal tidak bersarang terhadap K**:
10 teratas pada K = 20 hanya sama dengan daftar K = 10 pada 88 dari 140 kasus
(hibrida 31 / 140; semantik 140 / 140). Dari 52 kasus leksikal yang berubah,
**37 berubah keanggotaannya dan ke-37-nya punya skor `ts_rank_cd` yang seri
tepat di batas peringkat 10/11**; tidak ada satu pun kasus berubah yang bebas
dari skor kembar.

Ini bukan nondeterminisme — jalan yang diulang dengan `LIMIT` yang sama memberi
hasil identik. Ini ketergantungan pemecahan seri pada nilai `LIMIT`:
`ORDER BY … LIMIT n` di PostgreSQL tidak menjanjikan urutan tertentu di antara
baris berskor sama, dan `ts_rank_cd` menghasilkan skor yang sangat kasar (pada
contoh yang diperiksa hanya 5–9 nilai skor unik untuk 22–25 chunk yang cocok).

Konsekuensi praktis: menaikkan `topKLexical` tidak sekadar menambahkan kandidat
di ekor daftar, ia juga dapat mengganti anggota 10 teratas. Perbandingan
antar-K pada lengan leksikal dan hibrida karena itu bukan perbandingan
"himpunan yang sama, ditambah ekor".

Catatan ukuran daftar dari korpus yang sama: lengan leksikal sering
mengembalikan kurang dari K karena kuerinya memang cocok ke sedikit chunk —
kurang dari K pada 23 kasus (K=5), 43 (K=10), dan 84 (K=20), termasuk 15 kasus
yang kuerinya kosong sama sekali. Karena itu metrik harus memakai **K yang
diminta** sebagai penyebut, bukan jumlah yang kebetulan kembali; inilah yang
dilakukan `computeRetrievalMetrics(retrievedIds, groundTruthIds, k)`.

## SQL di sini BUKAN bagian dari library

Library tidak punya akses basis data. Ia hanya mendefinisikan tipe handler
`SemanticSearchHandler` dan `LexicalSearchHandler`, dan aplikasi pemakailah
yang mengimplementasikannya. Tiga kueri SQL yang dipakai pada eksperimen —
pencarian semantik `embedding <=> $vector`, pencarian leksikal
`ts_rank_cd(content_tsv, to_tsquery('simple', $query))`, dan document frequency
— berasal dari **aplikasi**, bukan dari library. Ketiganya disalin apa adanya
ke `adapter.example.ts` agar hasilnya dapat ditelaah dan direproduksi, bukan
sebagai bagian dari API yang didukung.

Konfigurasi basis data pada eksperimen: PostgreSQL 18.4, pgvector 0.8.1,
indeks `gin(content_tsv)` untuk lengan leksikal, dan **tanpa indeks vektor**
sama sekali — sehingga pencarian semantik bersifat eksak (brute force), bukan
ANN.

## Cara menjalankan

1. `cp adapter.example.ts adapter.ts`, lalu isi `query()`, `closePool()`, dan
   `embedQuery()`. Baca kredensial dari `process.env`; jangan menuliskannya di
   berkas.
2. Siapkan basis data berisi tabel `documents`, `criteria`, dan
   `document_chunks` dengan kolom `embedding vector(768)` dan
   `content_tsv tsvector` (skema lengkap ada di komentar `adapter.example.ts`).
3. Jalankan:

```bash
npx tsx tests/equivalence/run_k_sensitivity.ts
# dengan pembanding, bila Anda punya:
npx tsx tests/equivalence/run_k_sensitivity.ts --paper-rankings <path>
```

### Yang tidak akan sama

- **Huruf dokumen** (A, B, C, …) diberikan menurut urutan `created_at`, jadi
  bergantung pada instalasi Anda.
- **Identifier chunk** di `K1_rankings.csv` adalah UUID baris basis data pada
  instalasi tempat eksperimen dijalankan. Instalasi lain akan menghasilkan UUID
  yang berbeda, sehingga `K1_rankings.csv` **tidak dapat dibandingkan langsung**
  antar instalasi — ia disertakan sebagai rekaman, bukan sebagai berkas acuan
  untuk uji regresi.
- **Peringkat semantik** hanya akan cocok bila model embedding, prefiks kueri,
  dan teks chunk Anda identik. Prefiks yang dipakai: `"task: search result | query: "`
  untuk kueri dan `"title: none | text: "` untuk passage.

## Berkas

| Berkas                 | Isi                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_k_sensitivity.ts` | Skrip uji, sudah dibersihkan dari path pribadi dan modul aplikasi                                                                                                                                   |
| `adapter.example.ts`   | Kerangka adapter + SQL dari aplikasi; salin menjadi `adapter.ts`                                                                                                                                    |
| `K1_rankings.csv`      | 1.260 peringkat hasil jalan nyata (140 kasus × 3 metode × 3 nilai K). Kolom: `document`, `criterion`, `method`, `K`, `n_chunks_in_document`, `lexical_query_null`, `n_returned`, `ranked_chunk_ids` |

## Yang TIDAK ada di sini

Tidak ada dokumen sumber, teks laporan, label anotasi / ground truth, hasil
verdict LLM, maupun berkas peringkat pembanding. `K1_rankings.csv` hanya memuat
huruf dokumen, kode kriteria, nilai K, jumlah, dan identifier chunk — tidak ada
teks dan tidak ada label.
