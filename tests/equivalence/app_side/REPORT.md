# Kesetaraan implementasi aplikasi dan pustaka pada sepuluh dokumen (A–J)

Tugas hanya-baca, 23 Oktober 2026. Basis data diakses dengan `SELECT` saja, tidak ada baris yang ditulis atau diubah, tidak ada berkas repositori yang diubah, tidak ada branch yang dibuat atau digabung, dan tidak ada inferensi LLM. Layanan embedding dipanggil untuk 14 deskripsi kriteria (itu model embedding, bukan LLM), persis seperti `scripts/evaluate-retrieval.ts`. Seluruh keluaran berada di `results-regen-2026-10-23/lexical_equivalence/`.

- Branch: `feat-hapus-dokumen`
- Commit HEAD: `6e4b7278d172556db93b63c3371f8ec38f8e079a` (`6e4b727`, "test: sweep the lexical-query equivalence check across all 13 max_df values")
- Pustaka yang dipakai: `packages/lakin-eval-core`, masuk lewat `main: ./dist/index.js` — jadi yang diuji memang berkas `dist` yang dipakai produksi, bukan `src`.
- Pemetaan huruf dokumen diambil apa adanya dari `results-regen-2026-10-22/ten_docs/mapping_documents.csv`. Nama unit kerja dan kabupaten/kota tidak ditulis di laporan ini.

## Kesimpulan satu kalimat

**1.820 dari 1.820 perbandingan kueri leksikal identik, 1.820 dari 1.820 perbandingan fusi RRF identik, dan 350 dari 350 perbandingan terhadap daftar yang tersimpan identik — tanpa satu pun perbedaan.**

---

## 0. Ketidakkonsistenan dengan laporan sebelumnya

Empat hal perlu Anda ketahui sebelum membaca angkanya.

1. **Angka 910 tidak melekat pada skrip, melainkan pada korpus saat itu.** `scripts/check-lib-equivalence.ts` memilih dokumennya dengan `where indexing_status = 'done'` ([baris 70](scripts/check-lib-equivalence.ts#L70)), bukan dengan daftar dokumen tetap. Pada 15 Oktober 2026, saat commit `541b461` dan `6e4b727` dibuat, baru ada 5 dokumen terindeks sehingga keluarannya 70 kasus × 13 = 910. Skrip yang sama, **tanpa satu baris pun diubah**, dijalankan hari ini langsung menghasilkan 140 kasus × 13 = **1.820** karena F–J sudah terindeks. Keluarannya ada di `_out_original_script.log`.
2. **Tidak ada log atau laporan hasil pembuktian 910 yang tersimpan — TIDAK DITEMUKAN.** Saya mencari di `results/`, `results-regen-2026-10-20/`, `results-regen-2026-10-22/`, `analysis_out/`, dan `scripts/`. Yang ada hanya skripnya sendiri beserta dua commit-nya. Angka 910 pada naskah karena itu tidak dapat dirujuk ke berkas keluaran mana pun; mulai sekarang angka 1.820 dapat dirujuk ke `_out_original_script.log` dan `_log.txt` di folder ini.
3. **Klaim "retrieval 70/70 identik" tidak pernah mencakup F–J.** Tabel `retrieval_eval_results` hanya memuat 5 dokumen (A–E); untuk F–J jumlah barisnya **nol**. Lihat bagian 4. Validasi 70/70 pada `results-regen-2026-10-22/ten_docs/_log_retrieval.txt` juga menyebut dirinya sendiri "validasi @0.10 (5 dokumen lama)".
4. **Ada dua keluarga label tersimpan yang isinya sama.** Selain `*-010-20261011` ada `*-010-libpath` (15 Oktober), masing-masing 70 baris untuk 5 dokumen. Keduanya identik 70/70 pada ketiga lengan. Nama "libpath" menyiratkan jalur pustaka, tetapi satu-satunya penulis tabel itu adalah `scripts/evaluate-retrieval.ts:191`, yang memakai jalur **aplikasi** (`gatherCriteriaChunksDetailed`). Jadi label itu adalah nama yang dipilih saat menjalankan, bukan bukti bahwa barisnya dihasilkan pustaka — **jangan** dikutip di naskah sebagai hasil jalur pustaka.

Hal yang **konsisten**: jumlah kasus F–J tepat 5 × 14 = 70, sehingga total 140 kasus seperti yang Anda harapkan; dan hitungan kueri kosong hasil pemeriksaan ini sama persis dengan kolom "Empty queries" pada laporan 22 Oktober (58, 18, 12, 5, 4, 2, 1, 0 untuk kasus ber-bukti).

## 1. Cara pembuktian yang dipakai sebelumnya

**DITEMUKAN**: `scripts/check-lib-equivalence.ts`, dibuat pada commit `541b461` (15 Okt 2026 07:32) dan diperluas ke 13 nilai max_df pada commit `6e4b727` (15 Okt 2026 07:35). Isi caranya:

| Komponen | Sisi aplikasi | Sisi pustaka |
|---|---|---|
| Daftar stop word | `STOPWORDS` — `lib/text-search-utils.ts` | `DEFAULT_INDONESIAN_STOPWORDS` |
| Tokenisasi | `extractCandidateWords` — `lib/text-search-utils.ts:20` | `extractCandidateWords(desc, minWordLength)` |
| Penyusun kueri leksikal | `makeLexicalQueryBuilder` — [lib/rag-retrieval.ts:83](lib/rag-retrieval.ts#L83) | `buildDistinctiveLexicalQuery` — `packages/lakin-eval-core/src/retrieval/lexical-query.ts:13` |
| Fusi RRF | `applyRRF` — [lib/rag-retrieval.ts:127](lib/rag-retrieval.ts#L127), **tidak diekspor** | `applyRRF` — `packages/lakin-eval-core/src/retrieval/rrf.ts:11` |

Ke-13 nilai max_df diambil dari `scripts/sensitivity-max-df.ts:24` dan disalin ke `scripts/check-lib-equivalence.ts:43`:

`0,05 · 0,08 · 0,10 · 0,12 · 0,15 · 0,20 · 0,30 · 0,40 · 0,50 · 0,60 · 0,80 · 0,95 · 1,00`

Saya memakai cara itu **sama persis**, dengan dua langkah:

1. Menjalankan `scripts/check-lib-equivalence.ts` apa adanya, tanpa mengubah satu karakter pun (`_out_original_script.log`).
2. Menjalankan `check_equivalence.ts` di folder ini, yang mengulang logika yang sama tetapi menambah tiga hal yang dibutuhkan tugas ini: CSV satu baris per perbandingan, rincian per dokumen, dan **bagian RRF yang menjalankan jalur aplikasi secara langsung** alih-alih hanya membandingkan keluaran tersimpan.

Satu keterbatasan skrip lama yang perlu diakali: `applyRRF` sisi aplikasi tidak diekspor, sehingga skrip lama hanya bisa memakai keluarannya yang **tersimpan** — dan keluaran tersimpan itu hanya ada untuk A–E. Jalan keluarnya: fungsi `gatherCriteriaChunksDetailed` **diekspor** ([lib/rag-retrieval.ts:189](lib/rag-retrieval.ts#L189)) dan memanggil `applyRRF` aplikasi di [baris 241-244](lib/rag-retrieval.ts#L241-L244). Memanggil fungsi itu berarti menjalankan merger aplikasi yang sebenarnya, bukan salinannya. Dengan begitu F–J ikut terbukti tanpa perlu menulis apa pun ke basis data.

## 2. Perbandingan kueri leksikal (1.820 perbandingan)

Untuk setiap kasus (dokumen × kriteria aktif) dan setiap nilai max_df, kueri disusun dua kali dari deskripsi kriteria yang sama dan hitungan document-frequency yang sama (`select count(*) from document_chunks where document_id = $1 and content_tsv @@ to_tsquery('simple', $2)`), lalu dibandingkan sebagai string persis **dan** sebagai daftar term setelah diurutkan.

### Prasyarat

| Pemeriksaan | Hasil |
|---|---|
| Daftar stop word aplikasi vs pustaka | 44 kata vs 44 kata, **identik**, tidak ada kata yang hanya ada di salah satu sisi |
| Tokenisasi 14 deskripsi kriteria | **14/14 identik**, baik urutan maupun himpunan (`tokenization.csv`) |

### Hasil per dokumen

| Dokumen | Kasus | Nilai max_df | Perbandingan | Identik (string) | Berbeda | Himpunan term berbeda |
|---|---|---|---|---|---|---|
| A | 14 | 13 | 182 | 182 | 0 | 0 |
| B | 14 | 13 | 182 | 182 | 0 | 0 |
| C | 14 | 13 | 182 | 182 | 0 | 0 |
| D | 14 | 13 | 182 | 182 | 0 | 0 |
| E | 14 | 13 | 182 | 182 | 0 | 0 |
| F | 14 | 13 | 182 | 182 | 0 | 0 |
| G | 14 | 13 | 182 | 182 | 0 | 0 |
| H | 14 | 13 | 182 | 182 | 0 | 0 |
| I | 14 | 13 | 182 | 182 | 0 | 0 |
| J | 14 | 13 | 182 | 182 | 0 | 0 |
| **Total** | **140** | **13** | **1.820** | **1.820** | **0** | **0** |

Tidak ada perbedaan, sehingga tidak ada kasus yang perlu ditampilkan beserta kedua kuerinya. Rincian lengkap satu baris per perbandingan, termasuk teks kedua kueri, ada di `lexical_comparisons.csv` (1.820 baris).

### Kueri kosong per nilai max_df

"Kueri kosong" berarti tidak ada satu pun istilah pembeda yang lolos ambang, sehingga penyusun mengembalikan `null`; pada lengan hybrid itu berarti hasilnya semantik murni, pada lengan lexical berarti hasilnya kosong. Kedua sisi menghasilkan `null` pada kasus yang sama persis.

| max_df | Kasus | Kueri kosong (semua kasus) | Kasus ber-bukti | Kueri kosong (hanya kasus ber-bukti) |
|---|---|---|---|---|
| 0,05 | 140 | 62 | 135 | 58 |
| 0,08 | 140 | 22 | 135 | 18 |
| 0,10 | 140 | 15 | 135 | 12 |
| 0,12 | 140 | 6 | 135 | 5 |
| 0,15 | 140 | 5 | 135 | 4 |
| 0,20 | 140 | 2 | 135 | 2 |
| 0,30 | 140 | 1 | 135 | 1 |
| 0,40 | 140 | 0 | 135 | 0 |
| 0,50 | 140 | 0 | 135 | 0 |
| 0,60 | 140 | 0 | 135 | 0 |
| 0,80 | 140 | 0 | 135 | 0 |
| 0,95 | 140 | 0 | 135 | 0 |
| 1,00 | 140 | 0 | 135 | 0 |
| **Total** | | **113** | | **100** |

Total 113 kueri kosong di sisi aplikasi dan 113 di sisi pustaka — angka yang sama, pada kasus yang sama. Kolom "hanya kasus ber-bukti" cocok persis dengan kolom "Empty queries" pada laporan 22 Oktober. Kasus ber-bukti adalah 135 dari 140 (lima kasus tanpa chunk bukti: B/16, C/12, D/5, D/12, H/12).

## 3. Perbandingan fusi RRF (1.820 perbandingan)

Untuk setiap kasus dan setiap nilai max_df:

1. Lengan semantik dan lengan leksikal dijalankan lewat `gatherCriteriaChunksDetailed` (jalur aplikasi, SQL produksi apa adanya).
2. Kedua daftar itu diberikan ke `applyRRF` **pustaka** dengan `rrfK` 60 dan `finalTopK` 10.
3. Hasilnya dibandingkan dengan keluaran `gatherCriteriaChunksDetailed` pada `method: "hybrid"`, yang di dalamnya memakai `applyRRF` **aplikasi**.

| Dokumen | Perbandingan | Urutan id identik | Berbeda |
|---|---|---|---|
| A | 182 | 182 | 0 |
| B | 182 | 182 | 0 |
| C | 182 | 182 | 0 |
| D | 182 | 182 | 0 |
| E | 182 | 182 | 0 |
| F | 182 | 182 | 0 |
| G | 182 | 182 | 0 |
| H | 182 | 182 | 0 |
| I | 182 | 182 | 0 |
| J | 182 | 182 | 0 |
| **Total** | **1.820** | **1.820** | **0** |

Perbandingan ini bukan perbandingan kosong: pada **1.553 dari 1.820** perbandingan (85,3%) ada sekurang-kurangnya satu chunk yang muncul di **kedua** daftar masukan — justru di situlah perbedaan penanganan seri atau "first wins vs last wins" akan muncul bila ada. Pada max_df 0,10 angkanya 115 dari 140 kasus. Pada 113 perbandingan lengan leksikal kosong sehingga fusi bekerja atas satu daftar saja; seluruh 1.820 keluaran hybrid berisi tepat 10 chunk. Rincian per perbandingan, termasuk kedua daftar id, ada di `rrf_comparisons.csv` (1.820 baris).

Pembuktian gaya lama (keluaran aplikasi **tersimpan** vs pustaka) juga diulang dan tetap **70/70** pada max_df 0,10 — lihat `_out_original_script.log`. Yang baru pada laporan ini adalah bahwa angka itu kini 1.820/1.820 dan mencakup F–J.

## 4. Perbandingan dengan daftar yang tersimpan

### Yang tersimpan di `retrieval_eval_results`

| Label | Baris | Dokumen |
|---|---|---|
| `semantic-010-20261011` | 70 | A, B, C, D, E |
| `lexical-010-20261011` | 70 | A, B, C, D, E |
| `hybrid-010-20261011` | 70 | A, B, C, D, E |
| `semantic-010-libpath` | 70 | A, B, C, D, E |
| `lexical-010-libpath` | 70 | A, B, C, D, E |
| `hybrid-010-libpath` | 70 | A, B, C, D, E |

**Daftar kandidat tersimpan untuk Dokumen F, G, H, I, J: TIDAK DITEMUKAN.** Tabel `retrieval_eval_results` tidak memuat satu baris pun untuk kelima dokumen itu. Yang kurang: snapshot tiga lengan (`scripts/evaluate-retrieval.ts`) belum pernah dijalankan untuk F–J, dan menjalankannya sekarang berarti menulis ke basis data — di luar izin tugas ini. Akibatnya Langkah 4 dalam bentuk aslinya (membandingkan tiga lengan terhadap daftar tersimpan) hanya mungkin untuk A–E.

### Hasil perbandingan

| Sumber acuan | Lengan | Kasus | Identik |
|---|---|---|---|
| `retrieval_eval_results`, label 11 Oktober | semantic | 70 | **70** |
| `retrieval_eval_results`, label 11 Oktober | lexical | 70 | **70** |
| `retrieval_eval_results`, label 11 Oktober | hybrid | 70 | **70** |
| `evaluation_results` run putusan (A–E 10 Okt, F–J 22 Okt) | hybrid | 140 | **140** |
| **Total** | | **350** | **350** |

Baris terakhir itulah pengganti Langkah 4 untuk F–J: `evaluation_results.retrieved_chunk_ids` menyimpan sepuluh chunk yang benar-benar dilihat LLM pada setiap kasus, dihasilkan jalur produksi (`buildCriteriaBatches` → `gatherCriteriaChunks` → `applyRRF` aplikasi) pada run 22 Oktober. Menjalankan ulang jalur yang sama hari ini pada max_df 0,10 menghasilkan daftar yang sama persis untuk seluruh 140 kasus, termasuk 70 kasus F–J, dan tidak ada satu kasus pun yang daftarnya kosong. Lengan semantic dan lexical **terpisah** untuk F–J tetap **TIDAK DITEMUKAN** dalam bentuk tersimpan; untuk kedua lengan itu bukti pada F–J berasal dari Langkah 2 dan 3 di atas, bukan dari perbandingan terhadap data tersimpan.

Rincian per kasus ada di `stored_comparison.csv` (350 baris).

## 5. TIDAK DITEMUKAN

1. Log atau laporan hasil pembuktian 910 perbandingan — tidak ada di `results/`, `results-regen-2026-10-20/`, `results-regen-2026-10-22/`, `analysis_out/`, maupun `scripts/`.
2. Daftar kandidat retrieval tersimpan untuk Dokumen F–J di `retrieval_eval_results` — nol baris.
3. Lengan semantic dan lexical tersimpan secara terpisah untuk F–J — tidak ada; `evaluation_results` hanya menyimpan hasil akhir hybrid.
4. Skrip atau kode mana pun yang menyebut "libpath" — tidak ada; label itu hanya nama run yang diketik saat menjalankan `scripts/evaluate-retrieval.ts`.
5. Ekspor fungsi `applyRRF` sisi aplikasi — tidak ada; fungsi itu privat di `lib/rag-retrieval.ts:127` dan hanya dapat dijalankan lewat `gatherCriteriaChunksDetailed`.
6. Kolom `document_id` pada `evaluation_results` — tidak ada; dokumen hanya dapat dicapai lewat `evaluation_runs.document_id`.

## 6. Berkas dan tabel yang dibaca

**Kode**: `scripts/check-lib-equivalence.ts` · `scripts/sensitivity-max-df.ts` · `scripts/evaluate-retrieval.ts` · `scripts/snapshot-retrieval.ts` · `scripts/load-env.ts` · `lib/rag-retrieval.ts` · `lib/text-search-utils.ts` · `lib/embeddings.ts` · `lib/db.ts` · `packages/lakin-eval-core/package.json` · `packages/lakin-eval-core/dist/index.js` (lewat impor) · `packages/lakin-eval-core/src/retrieval/lexical-query.ts` dan `src/retrieval/rrf.ts` (sebagai rujukan baris).

**Data**: `results-regen-2026-10-22/ten_docs/mapping_documents.csv` · `results-regen-2026-10-22/ten_docs/run_retrieval.ts` · `results-regen-2026-10-22/ten_docs/_log_retrieval.txt` · `.env.local` (kredensial tidak dicetak di mana pun, tertulis `[DISEMBUNYIKAN]`).

**Tabel basis data, `SELECT` saja**: `documents` · `criteria` · `document_chunks` · `retrieval_ground_truth` · `retrieval_eval_results` · `evaluation_runs` · `evaluation_results` · `information_schema.columns`.

## 7. Berkas keluaran

| Berkas | Isi |
|---|---|
| `REPORT.md` | laporan ini |
| `check_equivalence.ts` | skrip utama (SELECT saja, tidak menulis ke basis data) |
| `lexical_comparisons.csv` | 1.820 baris: satu baris per perbandingan kueri, termasuk teks kedua kueri |
| `rrf_comparisons.csv` | 1.820 baris: satu baris per perbandingan fusi, termasuk kedua daftar id |
| `stored_comparison.csv` | 350 baris: perbandingan terhadap daftar tersimpan |
| `empty_queries.csv` | kueri kosong per nilai max_df, semua kasus dan kasus ber-bukti |
| `summary_per_document.csv` | ringkasan per dokumen |
| `tokenization.csv` | perbandingan tokenisasi 14 kriteria |
| `_out_original_script.log` | keluaran `scripts/check-lib-equivalence.ts` yang dijalankan apa adanya |
| `_log.txt`, `_out_check.log`, `_raw.json` | log dan data mentah skrip utama |
