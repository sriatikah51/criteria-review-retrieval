import type {
  ChunkRow,
  Criteria,
  CriteriaBatch,
  EvaluationResultItem,
  LakinEvalConfig,
  LabeledChunk,
  RetrievalMetrics,
  VerdictMetrics,
} from "../types/index.js";
import { resolveConfig } from "../config/defaults.js";
import { buildLabeledChunks } from "../chunking/structure-chunker.js";
import { applyRRF } from "../retrieval/rrf.js";
import { buildCriteriaBatches } from "../evaluation/batcher.js";
import { buildEvaluationPrompt } from "../evaluation/prompt.js";
import {
  parseModelJson,
  extractEvaluationResults,
  mergeChunkResults,
} from "../evaluation/parser.js";
import { computeRetrievalMetrics } from "../metrics/retrieval-metrics.js";
import { computeVerdictMetrics, type VerdictComparisonCase } from "../metrics/verdict-metrics.js";

export interface SemanticSearchHandler {
  (criteriaDescription: string, topK: number): Promise<ChunkRow[]>;
}

export interface LexicalSearchHandler {
  (distinctiveWordsQuery: string, topK: number): Promise<ChunkRow[]>;
}

export interface LLMCallHandler {
  (prompt: string): Promise<string>;
}

/**
 * Pipeline End-to-End untuk LAKIN Review Evaluation Flow
 */
export class LakinEvaluationPipeline {
  private config: ReturnType<typeof resolveConfig>;

  constructor(customConfig?: Partial<LakinEvalConfig>) {
    this.config = resolveConfig(customConfig);
  }

  /**
   * Konfigurasi aktif
   */
  getConfig() {
    return this.config;
  }

  /**
   * Langkah 2 & 4: Memecah teks dokumen LAKIN menjadi chunk terstruktur
   * dengan penanda [Halaman N] fisik PDF.
   */
  chunkDocument(extractedText: string): LabeledChunk[] {
    return buildLabeledChunks(extractedText, this.config);
  }

  /**
   * Langkah 4 & 7: Hybrid Retrieval per kriteria dengan Reciprocal Rank Fusion (RRF).
   * Mengambil top-K semantik dan top-K leksikal, lalu menggabungkannya dengan rumus RRF.
   */
  async retrieveChunksForCriterion(
    criterion: Criteria,
    lexicalQuery: string | null,
    semanticSearch: SemanticSearchHandler,
    lexicalSearch?: LexicalSearchHandler
  ): Promise<ChunkRow[]> {
    const semanticResults = await semanticSearch(criterion.description, this.config.topKSemantic);

    let lexicalResults: ChunkRow[] = [];
    if (lexicalQuery && lexicalSearch) {
      lexicalResults = await lexicalSearch(lexicalQuery, this.config.topKLexical);
    }

    return applyRRF([semanticResults, lexicalResults], this.config);
  }

  /**
   * Langkah 4 & 8: Mengelompokkan kriteria ke dalam batch yang efisien untuk konteks LLM
   */
  createBatches(criteriaList: Criteria[], chunksByCriteria: ChunkRow[][]): CriteriaBatch[] {
    return buildCriteriaBatches(criteriaList, chunksByCriteria, this.config);
  }

  /**
   * Pemanggil bawaan HTTP untuk endpoint apa pun yang OpenAI-compatible
   * (mis. vLLM, Ollama, llama.cpp, OpenAI), memakai config llmBaseUrl,
   * llmApiKey, dan llmModel.
   *
   * Ketiganya tidak punya nilai default: isi lewat variabel lingkungan
   * OPENAI_BASE_URL / OPENAI_MODEL / OPENAI_API_KEY atau lewat konfigurasi
   * kustom. Bila llmBaseUrl atau llmModel kosong, method ini melempar error
   * daripada mengirim permintaan yang pasti gagal.
   */
  async callOpenAI(prompt: string): Promise<string> {
    if (!this.config.llmBaseUrl) {
      throw new Error(
        "llmBaseUrl belum diisi. Set OPENAI_BASE_URL atau berikan llmBaseUrl " +
          "pada konfigurasi pipeline, atau suntikkan handler LLM Anda sendiri " +
          "ke evaluateBatch(batch, callLLM)."
      );
    }
    if (!this.config.llmModel) {
      throw new Error(
        "llmModel belum diisi. Set OPENAI_MODEL atau berikan llmModel pada " +
          "konfigurasi pipeline."
      );
    }
    const url = `${this.config.llmBaseUrl.replace(/\/+$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.llmApiKey) {
      headers.Authorization = `Bearer ${this.config.llmApiKey}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.llmModel,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      throw new Error(`LLM call failed (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data?.choices?.[0]?.message?.content ?? "";
  }

  /**
   * Langkah 8 & 9: Membangun prompt dan mengevaluasi satu batch kriteria via LLM.
   * Jika parameter `callLLM` tidak diberikan, otomatis menggunakan method bawaan `callOpenAI`.
   */
  async evaluateBatch(batch: CriteriaBatch, callLLM?: LLMCallHandler): Promise<EvaluationResultItem[]> {
    const prompt = buildEvaluationPrompt(batch.context, batch.criteria);
    const rawResponse = callLLM ? await callLLM(prompt) : await this.callOpenAI(prompt);
    const parsed = parseModelJson(rawResponse);
    return extractEvaluationResults(parsed);
  }

  /**
   * Menggabungkan hasil evaluasi dari beberapa batch
   */
  mergeResults(batchResults: EvaluationResultItem[][]): EvaluationResultItem[] {
    return mergeChunkResults(batchResults);
  }

  /**
   * Langkah 5 & 11: Mengukur akurasi retrieval terhadap Ground Truth Chunk expert
   *
   * `k` adalah jumlah chunk yang diminta; bila dihilangkan dipakai `finalTopK`
   * dari konfigurasi pipeline, sebab itulah K yang sebenarnya diminta ke
   * retrieval - bukan jumlah yang kebetulan terisi.
   */
  evaluateRetrievalQuality(
    retrievedIds: string[],
    groundTruthIds: string[],
    k: number = this.config.finalTopK
  ): RetrievalMetrics {
    return computeRetrievalMetrics(retrievedIds, groundTruthIds, k);
  }

  /**
   * Langkah 5 & 11: Mengukur akurasi verdict terhadap Ground Truth Verdict buta
   */
  evaluateVerdictAccuracy(cases: VerdictComparisonCase[]): VerdictMetrics {
    return computeVerdictMetrics(cases);
  }
}
