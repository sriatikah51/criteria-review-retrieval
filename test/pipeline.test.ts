import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LakinEvaluationPipeline } from "../src/pipeline/index.js";
import type { Criteria, ChunkRow } from "../src/types/index.js";

describe("LakinEvaluationPipeline Orchestrator", () => {
  it("harus menggunakan konfigurasi default yang sesuai spesifikasi diagram", () => {
    const pipeline = new LakinEvaluationPipeline();
    const cfg = pipeline.getConfig();

    assert.equal(cfg.chunkSize, 3500);
    assert.equal(cfg.overlapSentences, 1);
    assert.equal(cfg.chunkingMethod, "structure");
    assert.equal(cfg.topKSemantic, 10);
    assert.equal(cfg.topKLexical, 10);
    assert.equal(cfg.finalTopK, 10);
    assert.equal(cfg.rrfK, 60);
    assert.equal(cfg.maxDocFrequencyRatio, 0.1);
    assert.equal(cfg.batchBudgetChars, 40000);
    assert.equal(cfg.embeddingModel, "google/embeddinggemma-300m");
    assert.equal(cfg.embeddingDimension, 768);
    // Tidak ada model default: harus diisi lewat OPENAI_MODEL atau konfigurasi.
    assert.equal(cfg.llmModel, process.env.OPENAI_MODEL || "");
    assert.equal(cfg.llmBaseUrl, process.env.OPENAI_BASE_URL || "");
    assert.equal(cfg.llmApiKey, process.env.OPENAI_API_KEY || "");
  });

  it("harus mendukung kustomisasi parameter dengan nilai default sebagai fallback", () => {
    const customPipeline = new LakinEvaluationPipeline({
      chunkSize: 2000,
      rrfK: 40,
      batchBudgetChars: 25000,
      llmModel: "gpt-4o",
    });
    const cfg = customPipeline.getConfig();

    assert.equal(cfg.chunkSize, 2000);
    assert.equal(cfg.rrfK, 40);
    assert.equal(cfg.batchBudgetChars, 25000);
    assert.equal(cfg.llmModel, "gpt-4o");
    // Parameter yang tidak di-override tetap memakai default
    assert.equal(cfg.overlapSentences, 1);
    assert.equal(cfg.finalTopK, 10);
  });

  it("harus menjalankan alur chunking dan batching dengan mulus", async () => {
    const pipeline = new LakinEvaluationPipeline();

    const sampleDoc = `[Halaman 1]
BAB I PENDAHULUAN
LAKIN merupakan bentuk pertanggungjawaban akuntabilitas instansi pemerintah.

[Halaman 2]
BAB II PERENCANAAN KINERJA
Target kinerja tahunan telah ditetapkan sesuai indikator kinerja utama.`;

    const chunks = pipeline.chunkDocument(sampleDoc);
    assert.equal(chunks.length, 2);

    const criteria: Criteria = {
      id: "crit-1",
      code: "K1",
      description: "Laporan memuat target indikator kinerja utama",
    };

    // Simulasi retrieval per kriteria
    const mockSemantic = async () => [
      { id: "chunk-1", chunkIndex: 0, content: chunks[0].content },
      { id: "chunk-2", chunkIndex: 1, content: chunks[1].content },
    ];
    const mockLexical = async () => [
      { id: "chunk-2", chunkIndex: 1, content: chunks[1].content },
    ];

    const retrieved = await pipeline.retrieveChunksForCriterion(
      criteria,
      "target | indikator",
      mockSemantic,
      mockLexical
    );

    assert.equal(retrieved.length, 2);
    // Chunk 2 ada di kedua list -> skor RRF tertinggi
    assert.equal(retrieved[0].id, "chunk-2");

    // Simulasi evaluasi batch
    const batches = pipeline.createBatches([criteria], [[retrieved[0], retrieved[1]]]);
    assert.equal(batches.length, 1);

    const mockLLM = async () =>
      JSON.stringify({
        results: [
          {
            criteria_code: "K1",
            verdict: "ya",
            evidence_quote: "Target kinerja tahunan telah ditetapkan",
            evidence_location: "BAB II",
            evidence_page: "2",
            reasoning: "Memuat target IKU secara eksplisit",
          },
        ],
      });

    const evalResults = await pipeline.evaluateBatch(batches[0], mockLLM);
    assert.equal(evalResults.length, 1);
    assert.equal(evalResults[0].criteria_code, "K1");
    assert.equal(evalResults[0].verdict, "ya");
    assert.equal(evalResults[0].evidence_page, "2");
  });

  it("callOpenAI hanya mengirim header Authorization bila llmApiKey tidak kosong", async () => {
    const originalFetch = globalThis.fetch;
    const captured: Record<string, string>[] = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      captured.push({ ...(init?.headers as Record<string, string>) });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const base = { llmBaseUrl: "http://llm.example.test/v1", llmModel: "model-uji" };

      // (a) tanpa kunci: tidak ada header Authorization
      await new LakinEvaluationPipeline({ ...base, llmApiKey: "" }).callOpenAI("halo");
      // (b) dengan kunci: header terkirim dengan format Bearer
      await new LakinEvaluationPipeline({ ...base, llmApiKey: "kunci-uji" }).callOpenAI("halo");
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(captured.length, 2);
    assert.equal("Authorization" in captured[0], false);
    assert.equal(captured[0]["Content-Type"], "application/json");
    assert.equal(captured[1].Authorization, "Bearer kunci-uji");
    assert.equal(captured[1]["Content-Type"], "application/json");
  });
});
