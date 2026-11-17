# criteria-review-retrieval

Library TypeScript tanpa dependensi runtime untuk alur **retrieval hibrida dan
evaluasi dokumen terhadap daftar kriteria**: pemecahan dokumen berbasis
struktur, penyusunan kueri leksikal pembeda, peleburan peringkat dengan
Reciprocal Rank Fusion, pengelompokan kriteria ke dalam panggilan LLM, serta
perhitungan metrik retrieval dan metrik verdict.
Library ini dikembangkan untuk studi kasus peninjauan Laporan Kinerja Instansi
Pemerintah (LAKIN); nama tipe dan teks prompt masih spesifik studi kasus
tersebut.

Library ini **sengaja tidak melakukan I/O**. Ia tidak membuka koneksi basis
data, tidak memanggil model, dan tidak membaca berkas. Semua itu disediakan
aplikasi pemakai lewat *handler* (lihat [Antarmuka handler](#antarmuka-handler-yang-harus-disediakan-aplikasi)).
Konsekuensinya: nol dependensi runtime, dan library dapat diuji tanpa basis
data maupun model.

- **Lisensi**: MIT
- **Dependensi runtime**: nol
- **Uji**: 57 pengujian dalam 10 suite (`npm test`)

---

## Instalasi

```bash
npm install criteria-review-retrieval
```

Membutuhkan Node.js 18 atau lebih baru (`fetch` bawaan dipakai oleh helper
`callOpenAI()` opsional).

---

## Antarmuka handler yang harus disediakan aplikasi

Library mendefinisikan tiga tipe handler; aplikasi mengimplementasikannya.
Tidak ada implementasi bawaan untuk dua yang pertama.

```typescript
// Mengembalikan topK chunk paling mirip secara semantik, TERURUT dari
// paling mirip. Implementasi bebas: pgvector, FAISS, Qdrant, apa pun.
type SemanticSearchHandler =
  (criteriaDescription: string, topK: number) => Promise<ChunkRow[]>;

// Mengembalikan topK chunk paling cocok secara leksikal, TERURUT dari
// peringkat tertinggi. Argumen pertama adalah kueri yang dihasilkan
// buildDistinctiveLexicalQuery(), berupa kata-kata digabung dengan " | ".
type LexicalSearchHandler =
  (distinctiveWordsQuery: string, topK: number) => Promise<ChunkRow[]>;

// Mengirim prompt ke model dan mengembalikan teks balasannya.
type LLMCallHandler = (prompt: string) => Promise<string>;
```

`ChunkRow` adalah bentuk minimum yang dibutuhkan library:

```typescript
interface ChunkRow {
  id: string;         // identifier unik chunk
  chunkIndex: number; // posisi chunk di dalam dokumen, dipakai untuk mengurutkan konteks
  content: string;    // teks chunk
  score?: number;     // diisi library setelah RRF
  rank?: number;      // diisi library setelah RRF
}
```

Satu handler lagi dibutuhkan `buildDistinctiveLexicalQuery()`:

```typescript
// Mengembalikan pada berapa banyak chunk sebuah kata muncul (document
// frequency) di dalam dokumen yang sedang dinilai.
type DocumentFrequencyFunction = (word: string) => Promise<number> | number;
```

### Catatan penting soal urutan

Library **tidak** mengurutkan ulang hasil handler. Ia mempercayai urutan yang
Anda kembalikan, karena RRF hanya memakai *peringkat*, bukan skor. Bila handler
Anda mengembalikan daftar yang tidak terurut, hasil peleburan akan salah tanpa
pesan error.

### Pemecahan seri pada pencarian leksikal

Bila fungsi peringkat leksikal Anda menghasilkan banyak skor kembar (ini terjadi
pada `ts_rank_cd` PostgreSQL), daftar top-K dapat berubah saat `LIMIT` berubah —
basis data bebas memilih baris mana di antara yang seri. Akibatnya top-10 dari
`LIMIT 20` belum tentu sama dengan top-10 dari `LIMIT 10`. Lihat
[`tests/equivalence/`](tests/equivalence/) untuk pengukurannya pada satu korpus
nyata.

---

## Parameter konfigurasi dan nilai default

Seluruh nilai di bawah diambil dari `src/config/defaults.ts`. Semua opsional;
yang tidak diisi memakai default.

### Chunking — `DEFAULT_CHUNKER_CONFIG`

| Parameter | Tipe | Default | Keterangan |
|---|---|---|---|
| `chunkSize` | `number` | `3500` | Batas karakter per chunk. Dikalibrasi terhadap window 2.048 token EmbeddingGemma; sesuaikan bila model embedding Anda berbeda |
| `overlapSentences` | `number` | `1` | Jumlah kalimat tumpang-tindih antar chunk bertetangga (untuk metode `sentence` dan `structure`) |
| `chunkingMethod` | `"structure" \| "sentence" \| "fixed"` | `"structure"` | `structure` memecah di heading `BAB <angka Romawi>` lalu jatuh ke pemecahan kalimat di dalam bab yang terlalu panjang |
| `minChunkChars` | `number` | `30` | Minimum karakter non-spasi; chunk yang lebih pendek dibuang |
| `pageMarkerTemplate` | `string` | `"[Halaman {page_number}]"` | Template penanda halaman yang dicari di teks hasil ekstraksi |

### Retrieval — `DEFAULT_RETRIEVAL_CONFIG`

| Parameter | Tipe | Default | Keterangan |
|---|---|---|---|
| `topKSemantic` | `number` | `10` | Jumlah kandidat yang diminta dari handler semantik |
| `topKLexical` | `number` | `10` | Jumlah kandidat yang diminta dari handler leksikal |
| `finalTopK` | `number` | `10` | Jumlah chunk yang dikembalikan setelah RRF |
| `rrfK` | `number` | `60` | Konstanta peredam RRF: `score += 1 / (rrfK + rank)`, `rank` 1-indeks |
| `maxDocFrequencyRatio` | `number` | `0.1` | Kata yang muncul di lebih dari rasio ini terhadap total chunk dibuang dari kueri leksikal karena terlalu umum |
| `minWordLength` | `number` | `3` | Panjang minimum kata kandidat |
| `customStopwords` | `Set<string> \| string[]` | `DEFAULT_INDONESIAN_STOPWORDS` (44 kata) | Kata tugas yang dibuang dari kueri leksikal |

### Batching — `DEFAULT_BATCHER_CONFIG`

| Parameter | Tipe | Default | Keterangan |
|---|---|---|---|
| `batchBudgetChars` | `number` | `40000` | Anggaran karakter per panggilan LLM. **Hanya menghitung karakter isi chunk** yang belum ada di batch — bukan teks kriteria, bukan teks instruksi prompt, bukan pemisah. Prompt yang benar-benar terkirim karena itu selalu lebih panjang dari anggaran |

Satu kriteria beserta seluruh bukti chunk-nya tidak pernah dipecah ke dua batch,
sehingga hasil tiap kriteria tidak perlu rekonsiliasi lintas batch. Karena
pemeriksaan anggaran mensyaratkan batch tidak kosong, satu kriteria yang
chunk-nya sendiri melampaui anggaran tetap menjadi satu batch utuh.

### Model — `DEFAULT_MODEL_CONFIG`

| Parameter | Tipe | Default | Keterangan |
|---|---|---|---|
| `embeddingModel` | `string` | `"google/embeddinggemma-300m"` | Hanya label untuk pencatatan; library tidak memanggil model embedding apa pun |
| `embeddingDimension` | `number` | `768` | Idem — label untuk pencatatan |
| `llmModel` | `string` | `process.env.OPENAI_MODEL` atau `""` | Dibaca dari OPENAI_MODEL; kosong bila tidak diatur. Dipakai hanya oleh helper `callOpenAI()` |
| `llmBaseUrl` | `string` | `process.env.OPENAI_BASE_URL` atau `""` | Dibaca dari OPENAI_BASE_URL; kosong bila tidak diatur. Endpoint OpenAI-compatible (mis. vLLM, Ollama, llama.cpp, OpenAI) |
| `llmApiKey` | `string` | `process.env.OPENAI_API_KEY` atau `""` | Dibaca dari OPENAI_API_KEY; kosong bila tidak diatur. Header `Authorization` hanya dikirim `callOpenAI()` bila nilainya tidak kosong |

`callOpenAI()` melempar error yang jelas bila `llmBaseUrl` atau `llmModel`
kosong, daripada mengirim permintaan yang pasti gagal. Anda tidak wajib
memakainya: suntikkan handler Anda sendiri ke `evaluateBatch(batch, callLLM)`.

---

## Contoh singkat

```typescript
import {
  LakinEvaluationPipeline,
  buildDistinctiveLexicalQuery,
  type ChunkRow,
  type Criteria,
} from "criteria-review-retrieval";

const pipeline = new LakinEvaluationPipeline({ rrfK: 60, finalTopK: 10 });
const config = pipeline.getConfig();

// 1. Pecah dokumen menjadi chunk berlabel halaman
const chunks = pipeline.chunkDocument(extractedText);

// 2. Susun kueri leksikal pembeda untuk satu kriteria.
//    documentFrequency() adalah handler Anda.
const lexicalQuery = await buildDistinctiveLexicalQuery(
  criterion.description,
  totalChunksInDocument,
  documentFrequency,
  config
);

// 3. Retrieval hibrida: top-K semantik + top-K leksikal, dilebur dengan RRF
const retrieved = await pipeline.retrieveChunksForCriterion(
  criterion,
  lexicalQuery,
  semanticSearch, // handler Anda
  lexicalSearch   // handler Anda
);

// 4. Kelompokkan kriteria ke dalam batch, lalu nilai tiap batch
const batches = pipeline.createBatches(criteriaList, chunksByCriteria);
const results = await pipeline.evaluateBatch(batches[0], callLLM); // handler Anda

// 5. Ukur kualitas retrieval terhadap chunk acuan.
//    Penyebut adalah K yang DIMINTA, bukan jumlah yang kebetulan kembali.
const ir = pipeline.evaluateRetrievalQuality(
  retrieved.map((c) => c.id),
  groundTruthChunkIds,
  config.finalTopK
);
```

Fungsi juga dapat dipakai lepas dari pipeline: `buildLabeledChunks`,
`extractCandidateWords`, `buildDistinctiveLexicalQuery`, `applyRRF`,
`sortByDocumentOrder`, `buildCriteriaBatches`, `buildEvaluationPrompt`,
`parseModelJson`, `extractEvaluationResults`, `mergeChunkResults`,
`computeRetrievalMetrics`, `computeVerdictMetrics`.

---

## Pengembangan

```bash
npm install
npm run build      # tsup -> dist/ (CJS + ESM + .d.ts)
npm test           # node --test, 57 pengujian
npm run typecheck  # tsc --noEmit
```

---

## Bukti kesetaraan (`tests/equivalence/`)

Folder itu memuat satu skrip dan satu berkas hasil dari verifikasi di luar
library: pembuktian bahwa retrieval yang dijalankan **lewat kode library ini**
menghasilkan peringkat yang identik dengan peringkat yang dipakai pada
eksperimen yang dilaporkan, pada 420 perbandingan di K = 10 dan 1.820
perbandingan di 13 nilai `maxDocFrequencyRatio`.

**Yang perlu dipahami sebelum membacanya:**

- **Kueri SQL di dalam skrip itu BUKAN bagian dari library.** Keduanya
  (pencarian semantik `embedding <=> $vector` dan pencarian leksikal
  `ts_rank_cd(content_tsv, to_tsquery('simple', $query))`) berasal dari
  **aplikasi** yang memakai library ini, karena library memang tidak punya
  akses basis data — ia hanya mendefinisikan tipe handler. SQL itu disertakan
  apa adanya supaya hasilnya dapat ditelaah, bukan sebagai bagian dari API.
- **Skrip itu tidak dapat dijalankan langsung di repositori ini.** Ia
  membutuhkan basis data PostgreSQL berisi korpus, ekstensi pgvector, dan
  layanan embedding. Path pribadi dan rujukan modul aplikasi sudah dihapus dan
  diganti dengan satu berkas adapter yang harus Anda sediakan sendiri; lihat
  [`tests/equivalence/README.md`](tests/equivalence/README.md).
- **Tidak ada label, dokumen sumber, atau hasil evaluasi yang disertakan.**
  `K1_rankings.csv` hanya memuat huruf dokumen, kode kriteria, nilai K, dan
  daftar identifier chunk.
