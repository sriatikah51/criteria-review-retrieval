// Uji kesetaraan dan sensitivitas K, DIJALANKAN LEWAT KODE LIBRARY INI.
//
// Versi ini adalah salinan bersih dari skrip yang dipakai pada eksperimen yang
// dilaporkan. Path pribadi, modul aplikasi, dan rujukan repositori asal sudah
// dihapus dan diganti satu berkas adapter yang harus Anda sediakan sendiri
// (lihat adapter.example.ts). Tidak ada kredensial di berkas ini.
//
// Skrip ini TIDAK dapat dijalankan apa adanya: ia membutuhkan basis data
// PostgreSQL + pgvector berisi korpus yang sudah di-chunk dan di-embed, serta
// satu layanan embedding. Ia disertakan agar metode dan hasilnya dapat
// ditelaah, bukan sebagai bagian dari API library.
//
// === Yang berasal dari LIBRARY ini ===
//   buildDistinctiveLexicalQuery   src/retrieval/lexical-query.ts
//   applyRRF                       src/retrieval/rrf.ts
//   LakinEvaluationPipeline        src/pipeline/orchestrator.ts
//     #retrieveChunksForCriterion  (memanggil applyRRF di dalamnya)
//   resolveConfig / DEFAULT_CONFIG src/config/defaults.ts
//
// === Yang BUKAN dari library (dari aplikasi pemakai) ===
//   SQL pencarian semantik, SQL pencarian leksikal, SQL document frequency,
//   dan pemanggilan layanan embedding — semuanya di adapter.ts.
//   Library sengaja tidak punya akses basis data; ia hanya mendefinisikan
//   tipe handler SemanticSearchHandler dan LexicalSearchHandler.
//
// Jalankan (setelah membuat adapter.ts):
//   npx tsx tests/equivalence/run_k_sensitivity.ts [--paper-rankings <path>]

import { writeFileSync, readFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import path from "path";

import {
  LakinEvaluationPipeline,
  buildDistinctiveLexicalQuery,
  applyRRF,
  type ChunkRow,
} from "../../src/index.js";

import {
  query,
  closePool,
  embedQuery,
  toVectorLiteral,
  SQL_SEMANTIC,
  SQL_LEXICAL,
  SQL_DOC_FREQUENCY,
  type DbRow,
} from "./adapter.js";

const OUT = __dirname;
const K_VALUES = [5, 10, 20];
const MAXDF_VALUES = [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 0.95, 1.0];
const RRF_K = 60;
const MAX_DF = 0.1;
const MIN_WORD_LENGTH = 3;

// Peringkat pembanding bersifat opsional. Pada eksperimen yang dilaporkan,
// berkas ini berisi peringkat yang menghasilkan tabel di naskah. Berkas itu
// TIDAK disertakan di repositori publik.
const paperArgIdx = process.argv.indexOf("--paper-rankings");
const PAPER_RANKINGS = paperArgIdx > -1 ? process.argv[paperArgIdx + 1] : null;

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const J = (x: unknown) => JSON.stringify(x);
const toLib = (r: DbRow): ChunkRow => ({ id: r.id, chunkIndex: r.chunk_index, content: r.content });

const LOG: string[] = [];
const P = (s: string) => { console.log(s); LOG.push(s); };

async function main() {
  // --------------------------------------------------------------- 0. korpus
  // Huruf dokumen (A, B, C, …) diberikan menurut urutan created_at, bukan dari
  // daftar identifier yang ditanam di kode. Huruf karena itu bergantung pada
  // instalasi: dokumen ke-n di basis data Anda akan menjadi huruf ke-n.
  const docs = await query<{ id: string }>(
    "select id from documents order by created_at, id");
  const L = new Map<string, string>();
  docs.forEach((d, i) => L.set(d.id, String.fromCharCode(65 + i)));

  const kriteria = await query<{ id: string; code: string; description: string }>(
    "select id, code, description from criteria where is_active = true order by length(code), code");

  const nChunk = new Map<string, number>();
  let totalChunkSemua = 0;
  for (const d of docs) {
    const r = await query<{ n: number }>(
      "select count(*)::int n from document_chunks where document_id = $1", [d.id]);
    nChunk.set(d.id, r[0].n);
    totalChunkSemua += r[0].n;
  }
  P("dokumen: " + docs.length + " (" + docs.map((d) => L.get(d.id)).join("") + ")");
  P("kriteria aktif: " + kriteria.length + " (" + kriteria.map((k) => k.code).join(",") + ")");
  P("chunk total: " + totalChunkSemua);

  // --------------------------------------------------- handler (dari adapter)
  async function sqlSemantic(docId: string, vec: number[], topK: number): Promise<DbRow[]> {
    return query<DbRow>(SQL_SEMANTIC, [docId, toVectorLiteral(vec), topK]);
  }
  async function sqlLexical(docId: string, q: string, topK: number): Promise<DbRow[]> {
    return query<DbRow>(SQL_LEXICAL, [docId, q, topK]);
  }
  const dfCache = new Map<string, number>();
  async function sqlDf(docId: string, w: string): Promise<number> {
    const kk = docId + ":" + w;
    const a = dfCache.get(kk);
    if (a !== undefined) return a;
    const r = await query<{ n: number }>(SQL_DOC_FREQUENCY, [docId, w]);
    dfCache.set(kk, r[0].n);
    return r[0].n;
  }

  // ------------------------------------------------------------- 1. jalankan
  interface Hasil {
    document: string; criterion: string; K: number; nChunks: number; qNull: boolean;
    sem: string[]; lex: string[]; hyb: string[]; qText: string | null; rrfSingleOk: boolean;
  }

  async function jalankan(pass: number): Promise<{ hasil: Map<string, Hasil>; embHash: string }> {
    const emb = new Map<string, number[]>();
    for (const k of kriteria) emb.set(k.id, await embedQuery(k.description));
    const embHash = createHash("sha256")
      .update(kriteria.map((k) => emb.get(k.id)!.join(",")).join("|")).digest("hex").slice(0, 16);
    P("");
    P("pass " + pass + ": embedding " + kriteria.length + " kriteria, dim " +
      emb.get(kriteria[0].id)!.length + ", sha256(16)=" + embHash);

    const hasil = new Map<string, Hasil>();
    for (const K of K_VALUES) {
      // Satu pipeline LIBRARY per nilai K. Kolam per retriever = K, RRF k = 60,
      // lalu dipotong ke K — seluruhnya lewat resolveConfig library.
      const pipeline = new LakinEvaluationPipeline({
        topKSemantic: K, topKLexical: K, finalTopK: K,
        rrfK: RRF_K, maxDocFrequencyRatio: MAX_DF, minWordLength: MIN_WORD_LENGTH,
      });
      const cfg = pipeline.getConfig();

      for (const d of docs) {
        const huruf = L.get(d.id)!;
        const n = nChunk.get(d.id)!;
        const getDf = (w: string) => sqlDf(d.id, w);

        for (const k of kriteria) {
          // --- kueri leksikal: FUNGSI LIBRARY
          const qText = await buildDistinctiveLexicalQuery(k.description, n, getDf, cfg);

          // Handler dicatat agar lengan tunggal memakai daftar yang SAMA
          // dengan yang dilihat library, bukan hasil kueri ulang.
          let semRows: DbRow[] = [];
          let lexRows: DbRow[] = [];
          const semanticSearch = async (_desc: string, topK: number): Promise<ChunkRow[]> => {
            semRows = await sqlSemantic(d.id, emb.get(k.id)!, topK);
            return semRows.map(toLib);
          };
          const lexicalSearch = async (q: string, topK: number): Promise<ChunkRow[]> => {
            lexRows = await sqlLexical(d.id, q, topK);
            return lexRows.map(toLib);
          };

          // --- hybrid: FUNGSI LIBRARY (RRF di dalam retrieveChunksForCriterion)
          const hyb = await pipeline.retrieveChunksForCriterion(
            k, qText, semanticSearch, lexicalSearch);

          // --- lengan tunggal: urutan asli retriever, dipotong ke K.
          // Silang-uji: melebur SATU daftar saja dengan applyRRF library harus
          // menghasilkan urutan identik, sebab 1/(k+rank) monoton turun.
          const semIds = semRows.slice(0, K).map((r) => r.id);
          const lexIds = lexRows.slice(0, K).map((r) => r.id);
          const rrfSingleOk =
            J(applyRRF([semRows.map(toLib)], cfg).map((x) => x.id)) === J(semIds) &&
            J(applyRRF([lexRows.map(toLib)], cfg).map((x) => x.id)) === J(lexIds);

          hasil.set(K + "|" + huruf + "|" + k.code, {
            document: huruf, criterion: k.code, K, nChunks: n, qNull: qText === null,
            sem: semIds, lex: lexIds, hyb: hyb.map((x) => x.id), qText, rrfSingleOk,
          });
        }
      }
      P("  pass " + pass + " K=" + K + ": " + docs.length * kriteria.length + " kasus x 3 metode selesai");
    }
    return { hasil, embHash };
  }

  const run1 = await jalankan(1);

  // ------------------------------------------- 1b. tulis K1_rankings.csv
  const kol = ["document", "criterion", "method", "K", "n_chunks_in_document",
    "lexical_query_null", "n_returned", "ranked_chunk_ids"];
  const baris: string[] = [kol.join(",")];
  let singleOkSemua = true;
  for (const K of K_VALUES) for (const d of docs) for (const k of kriteria) {
    const h = run1.hasil.get(K + "|" + L.get(d.id) + "|" + k.code)!;
    if (!h.rrfSingleOk) singleOkSemua = false;
    for (const [metode, ids] of [["semantic", h.sem], ["lexical", h.lex], ["hybrid", h.hyb]] as const) {
      baris.push([h.document, h.criterion, metode, K, h.nChunks,
        h.qNull ? "ya" : "tidak", ids.length, ids.join(" ")].map(esc).join(","));
    }
  }
  writeFileSync(path.join(OUT, "K1_rankings.csv"), baris.join("\n") + "\n", "utf8");
  P("");
  P("ditulis K1_rankings.csv: " + (baris.length - 1) + " baris");
  P("silang-uji applyRRF([satu daftar]) == urutan asli: " +
    (singleOkSemua ? "SAMA pada seluruh kasus" : "ADA BEDA"));

  // --------------------------------------- 2. determinisme: ulang K=10
  const run2 = await jalankan(2);
  const bedaUlang: string[] = [];
  for (const d of docs) for (const k of kriteria) {
    const a = run1.hasil.get("10|" + L.get(d.id) + "|" + k.code)!;
    const b = run2.hasil.get("10|" + L.get(d.id) + "|" + k.code)!;
    for (const m of ["sem", "lex", "hyb"] as const) {
      if (J(a[m]) !== J(b[m])) bedaUlang.push(a.document + "/" + a.criterion + "/" + m);
    }
    if (a.qText !== b.qText) bedaUlang.push(a.document + "/" + a.criterion + "/query");
  }
  P("");
  P("== determinisme K=10 (dua jalan berurutan) ==");
  P("  embedding identik : " + (run1.embHash === run2.embHash ? "ya" : "TIDAK"));
  P("  peringkat berbeda : " + bedaUlang.length + " dari " + docs.length * kriteria.length * 3);
  for (const b of bedaUlang.slice(0, 10)) P("    " + b);

  // ------------------- 3. sapuan max_df + perbandingan opsional ke pembanding
  // Struktur berkas pembanding yang diharapkan (JSON):
  //   { sem:   { "<huruf>|<kode>": string[] },
  //     hasil: [ { maxDf: number, dok: string, code: string,
  //                lexIds: string[], hybIds: string[] } ] }
  let paperSem: Record<string, string[]> | null = null;
  let paperHasil: { maxDf: number; dok: string; code: string; lexIds: string[]; hybIds: string[] }[] | null = null;
  if (PAPER_RANKINGS && existsSync(PAPER_RANKINGS)) {
    const raw = JSON.parse(readFileSync(PAPER_RANKINGS, "utf8"));
    paperSem = raw.sem ?? null;
    paperHasil = raw.hasil ?? null;
    P("");
    P("peringkat pembanding dimuat dari: " + PAPER_RANKINGS);
  } else {
    P("");
    P("peringkat pembanding tidak diberikan (--paper-rankings) - perbandingan dilewati.");
  }

  if (paperSem && paperHasil) {
    const paperLexHyb = new Map<string, { lex: string[]; hyb: string[] }>();
    for (const h of paperHasil) {
      if (Math.abs(h.maxDf - MAX_DF) < 1e-12) paperLexHyb.set(h.dok + "|" + h.code, { lex: h.lexIds, hyb: h.hybIds });
    }
    let cek = 0, beda = 0;
    for (const d of docs) for (const k of kriteria) {
      const key = L.get(d.id) + "|" + k.code;
      const mine = run1.hasil.get("10|" + key)!;
      const ps = paperSem[key], pl = paperLexHyb.get(key);
      if (!ps || !pl) continue;
      for (const [a, b] of [[mine.sem, ps], [mine.lex, pl.lex], [mine.hyb, pl.hyb]] as const) {
        cek++;
        if (J(a) !== J(b)) beda++;
      }
    }
    P("");
    P("== kesetaraan K=10 vs peringkat pembanding ==");
    P("  identik: " + (cek - beda) + " dari " + cek);
  }

  P("");
  P("== sapuan max_df: " + MAXDF_VALUES.length + " nilai x " + docs.length * kriteria.length + " kasus ==");
  const sweepBaris = ["max_df,document,criterion,method,lexical_query_null,n_returned,ranked_chunk_ids"];
  let sweepCek = 0, sweepBedaLex = 0, sweepBedaHyb = 0;
  for (const v of MAXDF_VALUES) {
    const pipeline = new LakinEvaluationPipeline({
      topKSemantic: 10, topKLexical: 10, finalTopK: 10,
      rrfK: RRF_K, maxDocFrequencyRatio: v, minWordLength: MIN_WORD_LENGTH,
    });
    const cfg = pipeline.getConfig();
    let nNull = 0;
    for (const d of docs) {
      const n = nChunk.get(d.id)!;
      const getDf = (w: string) => sqlDf(d.id, w);
      for (const k of kriteria) {
        const key = L.get(d.id) + "|" + k.code;
        const qText = await buildDistinctiveLexicalQuery(k.description, n, getDf, cfg);
        if (qText === null) nNull++;
        const lexRows = qText ? await sqlLexical(d.id, qText, 10) : [];
        // Lengan semantik tidak bergantung pada max_df: dipakai daftar pass 1.
        // applyRRF hanya memakai urutan dan id, sehingga content kosong aman.
        const semRowsLib: ChunkRow[] = run1.hasil.get("10|" + key)!.sem
          .map((id, i) => ({ id, chunkIndex: i, content: "" }));
        const hyb = applyRRF([semRowsLib, lexRows.map(toLib)], cfg).map((x) => x.id);
        const lexIds = lexRows.map((r) => r.id);

        sweepBaris.push([v, L.get(d.id), k.code, "lexical", qText === null ? "ya" : "tidak",
          lexIds.length, lexIds.join(" ")].map(esc).join(","));
        sweepBaris.push([v, L.get(d.id), k.code, "hybrid", qText === null ? "ya" : "tidak",
          hyb.length, hyb.join(" ")].map(esc).join(","));

        if (paperHasil) {
          const pap = paperHasil.find((h) =>
            Math.abs(h.maxDf - v) < 1e-12 && h.dok === L.get(d.id) && h.code === k.code);
          if (pap) {
            sweepCek++;
            if (J(lexIds) !== J(pap.lexIds)) sweepBedaLex++;
            if (J(hyb) !== J(pap.hybIds)) sweepBedaHyb++;
          }
        }
      }
    }
    P("  max_df " + v + ": kueri leksikal kosong " + nNull);
  }
  writeFileSync(path.join(OUT, "K2_maxdf_sweep.csv"), sweepBaris.join("\n") + "\n", "utf8");
  if (paperHasil) {
    P("  perbandingan: " + sweepCek + " kasus | leksikal beda " + sweepBedaLex +
      " | hibrida beda " + sweepBedaHyb);
  }

  writeFileSync(path.join(OUT, "_run.log"), LOG.join("\n") + "\n", "utf8");
  P("");
  P("selesai.");
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
