import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCriteriaBatches,
  buildEvaluationPrompt,
  parseModelJson,
  extractEvaluationResults,
  mergeChunkResults,
} from "../src/evaluation/index.js";
import type { Criteria, ChunkRow } from "../src/types/index.js";

describe("Evaluation Module", () => {
  it("harus mengelompokkan kriteria ke batch tanpa memecah kriteria tunggal", () => {
    const criteria: Criteria[] = [
      { id: "1", code: "K1", description: "Kriteria 1" },
      { id: "2", code: "K2", description: "Kriteria 2" },
      { id: "3", code: "K3", description: "Kriteria 3" },
    ];

    // Anggap chunk panjangnya 500 karakter
    const chunkA: ChunkRow = { id: "c1", chunkIndex: 1, content: "A".repeat(500) };
    const chunkB: ChunkRow = { id: "c2", chunkIndex: 2, content: "B".repeat(500) };

    const chunksByCriteria = [[chunkA], [chunkB], [chunkA, chunkB]];

    // Set budget kecil (misal 800 char) agar terpecah jadi multiple batch
    const batches = buildCriteriaBatches(criteria, chunksByCriteria, {
      batchBudgetChars: 800,
    });

    assert.ok(batches.length >= 2);
    // Pastikan setiap kriteria ada di salah satu batch
    const allCriteriaCodes = batches.flatMap((b) => b.criteria.map((c) => c.code));
    assert.deepEqual(allCriteriaCodes.sort(), ["K1", "K2", "K3"]);
  });

  it("harus memuat instruksi penanda fisik [Halaman N] pada prompt yang dihasilkan", () => {
    const prompt = buildEvaluationPrompt("Teks Dokumen", [
      { id: "1", code: "K1", description: "Deskripsi K1" },
    ]);

    assert.ok(prompt.includes("[Halaman N]"));
    assert.ok(prompt.includes("halaman FISIK di dalam file PDF"));
    assert.ok(prompt.includes("K1: Deskripsi K1"));
  });

  it("harus mem-parse response JSON LLM meskipun dibungkus triple-backtick markdown", () => {
    const rawResponse = `Berikut adalah hasil evaluasi dokumen:
\`\`\`json
{
  "results": [
    {
      "criteria_code": "K1",
      "verdict": "ya",
      "evidence_quote": "Bukti kutipan",
      "evidence_location": "BAB I",
      "evidence_page": "12",
      "reasoning": "Sesuai ketentuan"
    }
  ]
}
\`\`\`
Terima kasih.`;

    const parsed = parseModelJson(rawResponse);
    const results = extractEvaluationResults(parsed);

    assert.equal(results.length, 1);
    assert.equal(results[0].criteria_code, "K1");
    assert.equal(results[0].verdict, "ya");
    assert.equal(results[0].evidence_page, "12");
  });

  it("harus memprioritaskan verdict 'ya' saat menggabungkan chunk results", () => {
    const run1 = [
      {
        criteria_code: "K1",
        verdict: "tidak" as const,
        evidence_quote: "",
        evidence_location: "",
        evidence_page: "",
        reasoning: "Tidak ditemukan di bagian 1",
      },
    ];
    const run2 = [
      {
        criteria_code: "K1",
        verdict: "ya" as const,
        evidence_quote: "Ditemukan bukti",
        evidence_location: "BAB II",
        evidence_page: "25",
        reasoning: "Terpenuhi di bab 2",
      },
    ];

    const merged = mergeChunkResults([run1, run2]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].verdict, "ya");
    assert.equal(merged[0].evidence_quote, "Ditemukan bukti");
  });
});
