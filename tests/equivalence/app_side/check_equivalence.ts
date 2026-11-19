// Kesetaraan implementasi APLIKASI vs PUSTAKA pada 10 dokumen (A-J).
//
// Cara pembuktiannya sama persis dengan scripts/check-lib-equivalence.ts
// (commit 541b461 dan 6e4b727), dengan tiga tambahan: keluaran CSV per
// perbandingan, rincian per dokumen, dan bagian RRF yang menjalankan jalur
// aplikasi secara langsung sehingga Dokumen F-J ikut terbukti.
//
//   (a) Penyusun kueri leksikal
//       aplikasi : makeLexicalQueryBuilder          lib/rag-retrieval.ts:83
//                  + extractCandidateWords/STOPWORDS lib/text-search-utils.ts
//       pustaka  : buildDistinctiveLexicalQuery
//                  packages/lakin-eval-core/src/retrieval/lexical-query.ts:13
//
//   (b) Fusi RRF
//       aplikasi : applyRRF  lib/rag-retrieval.ts:127 - TIDAK diekspor, tetapi
//                  dipanggil gatherCriteriaChunksDetailed (baris 241-244) yang
//                  diekspor. Jadi jalur aplikasi dijalankan apa adanya lewat
//                  fungsi itu, bukan lewat salinan.
//       pustaka  : applyRRF  packages/lakin-eval-core/src/retrieval/rrf.ts:11
//       Masukan kedua sisi sama: daftar semantik dan leksikal yang dihasilkan
//       lengan tunggal gatherCriteriaChunksDetailed pada parameter yang sama.
//
// HANYA SELECT. Tidak menulis ke basis data, tidak memanggil LLM. Layanan
// embedding dipakai untuk 14 deskripsi kriteria (bukan LLM), persis seperti
// scripts/evaluate-retrieval.ts.
//
// Jalankan: npx tsx results-regen-2026-10-23/lexical_equivalence/check_equivalence.ts
import "../../scripts/load-env";

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  DEFAULT_INDONESIAN_STOPWORDS,
  applyRRF,
  buildDistinctiveLexicalQuery,
  extractCandidateWords as libExtract,
  type ChunkRow as LibChunk,
} from "lakin-eval-core";
import { pool } from "@/lib/db";
import { embedTexts } from "@/lib/embeddings";
import { gatherCriteriaChunksDetailed, makeLexicalQueryBuilder } from "@/lib/rag-retrieval";
import { STOPWORDS, extractCandidateWords as appExtract } from "@/lib/text-search-utils";

const OUT = __dirname;
const REPO = path.resolve(__dirname, "..", "..");
// Ke-13 nilai yang sama dengan scripts/sensitivity-max-df.ts:24 dan
// scripts/check-lib-equivalence.ts:43.
const NILAI_MAX_DF = [0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 0.95, 1.0];
const MIN_WORD_LENGTH = 3;
const RRF_K = 60;
const FINAL_TOP_K = 10;
const MAX_DF_PRODUKSI = 0.1;
const LABEL_LAMA = {
  semantic: "semantic-010-20261011",
  lexical: "lexical-010-20261011",
  hybrid: "hybrid-010-20261011",
};

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const tulisCsv = (nama: string, kol: string[], baris: Record<string, unknown>[]) =>
  writeFileSync(path.join(OUT, nama),
    [kol.join(","), ...baris.map((r) => kol.map((k) => esc(r[k])).join(","))].join("\n") + "\n", "utf8");

interface AppChunk { id: string; chunk_index: number; content: string }
const toLib = (r: AppChunk): LibChunk => ({ id: r.id, chunkIndex: r.chunk_index, content: r.content });
const sama = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function main() {
  const LOG: string[] = [];
  const P = (s = "") => { console.log(s); LOG.push(s); };
  const judul = (t: string) => { P(); P("=".repeat(76)); P(t); P("=".repeat(76)); };

  // ---------------------------------------------------------------- konteks
  const mapCsv = readFileSync(
    path.join(REPO, "results-regen-2026-10-22", "ten_docs", "mapping_documents.csv"), "utf8")
    .trim().split(/\r?\n/).slice(1);
  const HURUF = new Map<string, string>();
  for (const baris of mapCsv) {
    const c = baris.split(",");
    HURUF.set(c[1], c[0]);
  }
  const L = (id: string) => HURUF.get(id) ?? `?${id.slice(0, 8)}`;

  const { rows: dokumen } = await pool.query<{ id: string; title: string }>(
    "select id, title from documents where indexing_status = 'done' order by created_at");
  const { rows: kriteria } = await pool.query<{ id: string; code: string; description: string }>(
    "select id, code, description from criteria where is_active = true order by length(code), code");
  const hurufUrut = dokumen.map((d) => L(d.id)).sort();
  P(`dokumen terindeks: ${dokumen.length} (${hurufUrut.join(", ")})`);
  P(`kriteria aktif   : ${kriteria.length}`);
  P(`kasus            : ${dokumen.length * kriteria.length}`);
  P(`nilai max_df (${NILAI_MAX_DF.length}): ${NILAI_MAX_DF.join(", ")}`);
  P(`perbandingan kueri leksikal yang direncanakan: ${dokumen.length * kriteria.length * NILAI_MAX_DF.length}`);

  // kasus yang punya bukti (ground truth chunk) - untuk hitungan kueri kosong
  const punyaBukti = new Set<string>();
  for (const r of (await pool.query<{ document_id: string; code: string }>(
    `select distinct g.document_id, c.code from retrieval_ground_truth g
     join criteria c on c.id = g.criteria_id
     where c.is_active and g.chunk_id is not null`)).rows) {
    punyaBukti.add(`${L(r.document_id)}|${r.code}`);
  }
  P(`kasus dengan bukti (|G| >= 1): ${punyaBukti.size}`);

  // ------------------------------------------------- prasyarat: stop word
  judul("PRASYARAT - KESETARAAN DAFTAR STOP WORD");
  const app = Array.from(STOPWORDS).sort();
  const lib = Array.from(DEFAULT_INDONESIAN_STOPWORDS).sort();
  const hanyaApp = app.filter((w) => !DEFAULT_INDONESIAN_STOPWORDS.has(w));
  const hanyaLib = lib.filter((w) => !STOPWORDS.has(w));
  P(`  aplikasi ${app.length} kata | pustaka ${lib.length} kata`);
  P(`  hanya di aplikasi: ${hanyaApp.length ? hanyaApp.join(", ") : "(tidak ada)"}`);
  P(`  hanya di pustaka : ${hanyaLib.length ? hanyaLib.join(", ") : "(tidak ada)"}`);
  P(`  IDENTIK: ${hanyaApp.length === 0 && hanyaLib.length === 0 ? "YA" : "TIDAK"}`);

  // ------------------------------------------------------- tokenisasi
  judul("TOKENISASI - APLIKASI vs PUSTAKA (tidak bergantung max_df)");
  let bedaTokenisasi = 0;
  const barisToken: Record<string, unknown>[] = [];
  for (const k of kriteria) {
    const a = appExtract(k.description);
    const b = libExtract(k.description, MIN_WORD_LENGTH);
    const identik = a.join(",") === b.join(",");
    const himpunanSama = a.slice().sort().join(",") === b.slice().sort().join(",");
    if (!identik) bedaTokenisasi++;
    barisToken.push({ criterion: k.code, n_app: a.length, n_lib: b.length,
      identical_order: identik, identical_set: himpunanSama,
      tokens_app: a.join(" | "), tokens_lib: b.join(" | ") });
  }
  tulisCsv("tokenization.csv",
    ["criterion", "n_app", "n_lib", "identical_order", "identical_set", "tokens_app", "tokens_lib"], barisToken);
  P(`  kriteria dengan tokenisasi berbeda: ${bedaTokenisasi}/${kriteria.length}`);

  // --------------------------------------- LANGKAH 2 + 3 dalam satu sapuan
  judul("LANGKAH 2 - KUERI LEKSIKAL, DAN LANGKAH 3 - FUSI RRF");

  const barisLex: Record<string, unknown>[] = [];
  const barisRrf: Record<string, unknown>[] = [];
  const perDok = new Map<string, { lexSama: number; lexBeda: number; setBeda: number; rrfSama: number; rrfBeda: number }>();
  const perNilai = new Map<number, { sama: number; beda: number; kosongSemua: number; kosongBukti: number; rrfSama: number; rrfBeda: number }>();
  for (const v of NILAI_MAX_DF) perNilai.set(v, { sama: 0, beda: 0, kosongSemua: 0, kosongBukti: 0, rrfSama: 0, rrfBeda: 0 });
  const contohBeda: string[] = [];

  // embedding kriteria: 14 panggilan ke layanan embedding, bukan LLM
  const emb = new Map<string, number[]>();
  for (const k of kriteria) emb.set(k.id, (await embedTexts([k.description], "query"))[0]);
  P(`  embedding kriteria dihitung: ${emb.size}`);

  // lengan semantik tidak bergantung max_df - dihitung sekali per kasus,
  // lewat jalur aplikasi yang sama (gatherCriteriaChunksDetailed).
  const SEM = new Map<string, AppChunk[]>();
  for (const d of dokumen) {
    for (const k of kriteria) {
      const { chunks } = await gatherCriteriaChunksDetailed(
        d.id, emb.get(k.id)!, k.description, async () => null, { method: "semantic" });
      SEM.set(`${L(d.id)}|${k.code}`, chunks as AppChunk[]);
    }
  }
  P(`  daftar semantik (jalur aplikasi): ${SEM.size}`);

  for (const d of dokumen) {
    const huruf = L(d.id);
    perDok.set(huruf, { lexSama: 0, lexBeda: 0, setBeda: 0, rrfSama: 0, rrfBeda: 0 });
    const { rows: c } = await pool.query<{ count: string }>(
      "select count(*)::text as count from document_chunks where document_id = $1", [d.id]);
    const totalChunks = Number(c[0].count);

    // frekuensi dokumen untuk sisi pustaka: satu cache per dokumen, lintas
    // seluruh nilai max_df (frekuensi tidak bergantung max_df). Sisi aplikasi
    // memakai cache internal builder-nya sendiri, apa adanya.
    const cache = new Map<string, number>();
    async function frekuensi(word: string): Promise<number> {
      const ada = cache.get(word);
      if (ada !== undefined) return ada;
      const { rows } = await pool.query<{ count: string }>(
        `select count(*)::text as count from document_chunks
         where document_id = $1 and content_tsv @@ to_tsquery('simple', $2)`, [d.id, word]);
      const n = Number(rows[0].count);
      cache.set(word, n);
      return n;
    }

    for (const maxDf of NILAI_MAX_DF) {
      const builderApp = makeLexicalQueryBuilder(d.id, totalChunks, maxDf);
      const akumN = perNilai.get(maxDf)!;
      const akumD = perDok.get(huruf)!;

      for (const k of kriteria) {
        const kunci = `${huruf}|${k.code}`;
        const bukti = punyaBukti.has(kunci);

        // ---- Langkah 2: dua penyusun kueri, masukan sama
        const qApp = await builderApp(k.description);
        const qLib = await buildDistinctiveLexicalQuery(k.description, totalChunks, frekuensi,
          { maxDocFrequencyRatio: maxDf, minWordLength: MIN_WORD_LENGTH });

        const termApp = (qApp ?? "").split(" | ").filter(Boolean);
        const termLib = (qLib ?? "").split(" | ").filter(Boolean);
        const identikString = qApp === qLib;
        const identikHimpunan =
          termApp.length === termLib.length &&
          termApp.slice().sort().join(",") === termLib.slice().sort().join(",");

        if (identikString) { akumN.sama++; akumD.lexSama++; }
        else {
          akumN.beda++; akumD.lexBeda++;
          if (!identikHimpunan) akumD.setBeda++;
          if (contohBeda.length < 10) {
            contohBeda.push(`  ${kunci} max_df=${maxDf} (himpunan ${identikHimpunan ? "SAMA, urutan beda" : "BEDA"})\n` +
              `    aplikasi: ${qApp}\n    pustaka : ${qLib}`);
          }
        }
        if (qApp === null) { akumN.kosongSemua++; if (bukti) akumN.kosongBukti++; }

        barisLex.push({
          document: huruf, criterion: k.code, max_df: maxDf, has_evidence: bukti,
          identical_string: identikString, identical_termset: identikHimpunan,
          n_terms_app: termApp.length, n_terms_lib: termLib.length,
          app_null: qApp === null, lib_null: qLib === null,
          query_app: qApp ?? "", query_lib: qLib ?? "",
        });

        // ---- Langkah 3: fusi RRF pada nilai max_df yang sama
        const semRows = SEM.get(kunci)!;
        const { chunks: lexRows } = await gatherCriteriaChunksDetailed(
          d.id, emb.get(k.id)!, k.description, builderApp, { method: "lexical" });
        const { chunks: hybApp } = await gatherCriteriaChunksDetailed(
          d.id, emb.get(k.id)!, k.description, builderApp, { method: "hybrid" });

        const hybLib = applyRRF([semRows.map(toLib), (lexRows as AppChunk[]).map(toLib)],
          { rrfK: RRF_K, finalTopK: FINAL_TOP_K });
        const idsApp = (hybApp as AppChunk[]).map((x) => x.id);
        const idsLib = hybLib.map((x) => x.id);
        const rrfIdentik = sama(idsApp, idsLib);
        if (rrfIdentik) { akumN.rrfSama++; akumD.rrfSama++; } else { akumN.rrfBeda++; akumD.rrfBeda++; }

        const tumpang = semRows.filter((s) => (lexRows as AppChunk[]).some((l) => l.id === s.id)).length;
        barisRrf.push({
          document: huruf, criterion: k.code, max_df: maxDf,
          n_semantic: semRows.length, n_lexical: (lexRows as AppChunk[]).length,
          overlap_ids: tumpang, n_hybrid_app: idsApp.length, n_hybrid_lib: idsLib.length,
          identical_order: rrfIdentik,
          hybrid_app: idsApp.join(" "), hybrid_lib: idsLib.join(" "),
        });
      }
    }
    const a = perDok.get(huruf)!;
    P(`  ${huruf}: kueri ${a.lexSama}/${a.lexSama + a.lexBeda} identik | RRF ${a.rrfSama}/${a.rrfSama + a.rrfBeda} identik`);
  }

  tulisCsv("lexical_comparisons.csv",
    ["document", "criterion", "max_df", "has_evidence", "identical_string", "identical_termset",
     "n_terms_app", "n_terms_lib", "app_null", "lib_null", "query_app", "query_lib"], barisLex);
  tulisCsv("rrf_comparisons.csv",
    ["document", "criterion", "max_df", "n_semantic", "n_lexical", "overlap_ids",
     "n_hybrid_app", "n_hybrid_lib", "identical_order", "hybrid_app", "hybrid_lib"], barisRrf);

  const totLexSama = barisLex.filter((r) => r.identical_string).length;
  const totRrfSama = barisRrf.filter((r) => r.identical_order).length;
  P();
  P(`  kueri leksikal: ${totLexSama}/${barisLex.length} identik sebagai string`);
  P(`  fusi RRF      : ${totRrfSama}/${barisRrf.length} identik urutannya`);
  if (contohBeda.length) { P("\n  Contoh perbedaan:"); for (const c of contohBeda) P(c); }

  // ------------------------------------------------ kueri kosong per max_df
  judul("KUERI KOSONG PER NILAI max_df");
  const barisKosong = NILAI_MAX_DF.map((v) => {
    const a = perNilai.get(v)!;
    return { max_df: v, empty_all_cases: a.kosongSemua, empty_cases_with_evidence: a.kosongBukti,
      n_cases: dokumen.length * kriteria.length, n_cases_with_evidence: punyaBukti.size,
      lexical_identical: `${a.sama}/${a.sama + a.beda}`, rrf_identical: `${a.rrfSama}/${a.rrfSama + a.rrfBeda}` };
  });
  tulisCsv("empty_queries.csv",
    ["max_df", "n_cases", "empty_all_cases", "n_cases_with_evidence", "empty_cases_with_evidence",
     "lexical_identical", "rrf_identical"], barisKosong);
  P(`  ${"max_df".padStart(7)} ${"kosong(semua)".padStart(14)} ${"kosong(bukti)".padStart(14)} ${"kueri identik".padStart(14)} ${"RRF identik".padStart(13)}`);
  for (const b of barisKosong) {
    P(`  ${String(b.max_df).padStart(7)} ${String(b.empty_all_cases).padStart(14)} ` +
      `${String(b.empty_cases_with_evidence).padStart(14)} ${b.lexical_identical.padStart(14)} ${b.rrf_identical.padStart(13)}`);
  }

  // ------------------------------------- LANGKAH 4: bandingkan dengan tersimpan
  judul("LANGKAH 4 - BANDINGKAN DENGAN DAFTAR TERSIMPAN");

  const barisSimpan: Record<string, unknown>[] = [];
  const { rows: tersimpan } = await pool.query<{ label: string; document_id: string; criteria_id: string; ids: string[] | null }>(
    `select run_label as label, document_id, criteria_id, retrieved_chunk_ids as ids
     from retrieval_eval_results where run_label = any($1)`,
    [[LABEL_LAMA.semantic, LABEL_LAMA.lexical, LABEL_LAMA.hybrid]]);
  const kodeDari = new Map(kriteria.map((k) => [k.id, k.code]));
  const simpan = new Map<string, string[]>();
  for (const r of tersimpan) {
    const code = kodeDari.get(r.criteria_id);
    if (!code) continue;
    simpan.set(`${r.label.split("-")[0]}|${L(r.document_id)}|${code}`, r.ids ?? []);
  }
  P(`  baris retrieval_eval_results untuk tiga label 11 Oktober: ${tersimpan.length}`);
  const dokTersimpan = new Set(tersimpan.map((r) => L(r.document_id)));
  P(`  dokumen yang tercakup: ${[...dokTersimpan].sort().join(", ") || "(tidak ada)"}`);
  const dokTanpa = hurufUrut.filter((h) => !dokTersimpan.has(h));
  P(`  dokumen TANPA daftar tersimpan: ${dokTanpa.join(", ") || "(tidak ada)"}`);

  const cocok = { semantic: [0, 0], lexical: [0, 0], hybrid: [0, 0] } as Record<string, [number, number]>;
  for (const d of dokumen) {
    const huruf = L(d.id);
    for (const k of kriteria) {
      const kunci = `${huruf}|${k.code}`;
      const r = barisRrf.find((x) => x.document === huruf && x.criterion === k.code && x.max_df === MAX_DF_PRODUKSI)!;
      const livSem = SEM.get(kunci)!.map((x) => x.id);
      const livHyb = String(r.hybrid_app).split(" ").filter(Boolean);
      for (const arm of ["semantic", "lexical", "hybrid"] as const) {
        const st = simpan.get(`${arm}|${kunci}`);
        if (!st) continue;
        const live = arm === "semantic" ? livSem
          : arm === "hybrid" ? livHyb
          : null;
        if (arm === "lexical") continue; // ditangani di bawah bersama daftar leksikal
        cocok[arm][1]++;
        const identik = sama(live!, st);
        if (identik) cocok[arm][0]++;
        barisSimpan.push({ source: "retrieval_eval_results 11 Okt", arm, document: huruf, criterion: k.code,
          identical: identik, n_stored: st.length, n_live: live!.length });
      }
    }
  }
  // lengan leksikal tersimpan vs jalur aplikasi pada max_df 0,10
  for (const d of dokumen) {
    const huruf = L(d.id);
    const { rows: c } = await pool.query<{ count: string }>(
      "select count(*)::text as count from document_chunks where document_id = $1", [d.id]);
    const builder = makeLexicalQueryBuilder(d.id, Number(c[0].count), MAX_DF_PRODUKSI);
    for (const k of kriteria) {
      const st = simpan.get(`lexical|${huruf}|${k.code}`);
      if (!st) continue;
      const { chunks } = await gatherCriteriaChunksDetailed(
        d.id, emb.get(k.id)!, k.description, builder, { method: "lexical" });
      const live = (chunks as AppChunk[]).map((x) => x.id);
      cocok.lexical[1]++;
      const identik = sama(live, st);
      if (identik) cocok.lexical[0]++;
      barisSimpan.push({ source: "retrieval_eval_results 11 Okt", arm: "lexical", document: huruf,
        criterion: k.code, identical: identik, n_stored: st.length, n_live: live.length });
    }
  }
  for (const arm of ["semantic", "lexical", "hybrid"] as const) {
    P(`  ${arm.padEnd(9)}: ${cocok[arm][0]}/${cocok[arm][1]} identik dengan daftar tersimpan 11 Oktober`);
  }

  // hybrid produksi run putusan (22 Okt) - satu-satunya keluaran tersimpan untuk F-J
  const { rows: runs } = await pool.query<{ id: string; document_id: string }>(
    `select distinct on (document_id) id, document_id from evaluation_runs
     where status='completed' order by document_id, started_at desc`);
  // evaluation_results tidak punya kolom document_id; dokumen diambil lewat run.
  const { rows: evr } = await pool.query<{ run_id: string; document_id: string; criteria_id: string; ids: string[] | null }>(
    `select e.run_id, r.document_id, e.criteria_id, e.retrieved_chunk_ids as ids
     from evaluation_results e join evaluation_runs r on r.id = e.run_id
     where e.run_id = any($1)`, [runs.map((r) => r.id)]);
  let evrSama = 0, evrBeda = 0, evrTanpa = 0;
  for (const d of dokumen) {
    const huruf = L(d.id);
    for (const k of kriteria) {
      const row = evr.find((x) => x.document_id === d.id && x.criteria_id === k.id);
      if (!row || !row.ids || row.ids.length === 0) { evrTanpa++; continue; }
      const r = barisRrf.find((x) => x.document === huruf && x.criterion === k.code && x.max_df === MAX_DF_PRODUKSI)!;
      const live = String(r.hybrid_app).split(" ").filter(Boolean);
      const identik = sama(live, row.ids);
      if (identik) evrSama++; else evrBeda++;
      barisSimpan.push({ source: "evaluation_results (run putusan)", arm: "hybrid", document: huruf,
        criterion: k.code, identical: identik, n_stored: row.ids.length, n_live: live.length });
    }
  }
  P(`  hybrid run putusan: ${evrSama}/${evrSama + evrBeda} identik | kasus tanpa daftar tersimpan: ${evrTanpa}`);
  tulisCsv("stored_comparison.csv",
    ["source", "arm", "document", "criterion", "identical", "n_stored", "n_live"], barisSimpan);

  // -------------------------------------------------------- ringkasan dokumen
  judul("RINGKASAN PER DOKUMEN");
  const barisDok = hurufUrut.map((h) => {
    const a = perDok.get(h)!;
    const sim = barisSimpan.filter((r) => r.document === h);
    return { document: h, cases: kriteria.length, max_df_values: NILAI_MAX_DF.length,
      lexical_comparisons: a.lexSama + a.lexBeda, lexical_identical: a.lexSama, lexical_different: a.lexBeda,
      termset_different: a.setBeda,
      rrf_comparisons: a.rrfSama + a.rrfBeda, rrf_identical: a.rrfSama, rrf_different: a.rrfBeda,
      stored_comparisons: sim.length, stored_identical: sim.filter((r) => r.identical).length };
  });
  tulisCsv("summary_per_document.csv", Object.keys(barisDok[0]), barisDok);
  P(`  ${"dok".padEnd(4)} ${"kueri identik".padStart(14)} ${"RRF identik".padStart(13)} ${"vs tersimpan".padStart(13)}`);
  for (const b of barisDok) {
    P(`  ${b.document.padEnd(4)} ${`${b.lexical_identical}/${b.lexical_comparisons}`.padStart(14)} ` +
      `${`${b.rrf_identical}/${b.rrf_comparisons}`.padStart(13)} ${`${b.stored_identical}/${b.stored_comparisons}`.padStart(13)}`);
  }

  judul("RINGKASAN");
  P(`  stop word      : ${hanyaApp.length === 0 && hanyaLib.length === 0 ? "IDENTIK" : "BERBEDA"}`);
  P(`  tokenisasi     : ${kriteria.length - bedaTokenisasi}/${kriteria.length} identik`);
  P(`  kueri leksikal : ${totLexSama}/${barisLex.length} identik`);
  P(`  fusi RRF       : ${totRrfSama}/${barisRrf.length} identik`);
  P(`  vs tersimpan   : ${barisSimpan.filter((r) => r.identical).length}/${barisSimpan.length} identik`);

  writeFileSync(path.join(OUT, "_raw.json"), JSON.stringify({
    head: process.env.GIT_HEAD ?? null,
    dokumen: hurufUrut, kriteria: kriteria.map((k) => k.code), nilaiMaxDf: NILAI_MAX_DF,
    perDokumen: barisDok, perNilai: barisKosong,
    total: { lexical: [totLexSama, barisLex.length], rrf: [totRrfSama, barisRrf.length],
      stored: [barisSimpan.filter((r) => r.identical).length, barisSimpan.length] },
    stopwordIdentik: hanyaApp.length === 0 && hanyaLib.length === 0,
    bedaTokenisasi, dokumenTanpaDaftarTersimpan: dokTanpa, kasusTanpaDaftarPutusan: evrTanpa,
  }, null, 1), "utf8");
  writeFileSync(path.join(OUT, "_log.txt"), LOG.join("\n") + "\n", "utf8");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
