import type {
  ChunkerConfig,
  RetrievalConfig,
  BatcherConfig,
  ModelConfig,
  LakinEvalConfig,
} from "../types/index.js";

/**
 * Nilai default sesuai spesifikasi produksi end-to-end:
 * - Chunking: batas 3500 char (window 2048 token EmbeddingGemma), overlap 1 kalimat, structure-based
 * - Retrieval: top-10 semantic, top-10 lexical, final top-10, RRF k=60, max doc frequency 10%
 * - Batching: budget 40.000 karakter per panggilan LLM
 * - Model: google/embeddinggemma-300m (768 dimensi)
 *
 * Catatan untuk pengguna library: nilai chunkSize 3500 dikalibrasi terhadap
 * window 2.048 token EmbeddingGemma. Bila Anda memakai model embedding lain,
 * sesuaikan nilainya.
 *
 * llmModel, llmBaseUrl, dan llmApiKey TIDAK punya nilai default bawaan dan
 * harus diisi sendiri - lewat variabel lingkungan OPENAI_MODEL /
 * OPENAI_BASE_URL / OPENAI_API_KEY, atau lewat konfigurasi kustom.
 */
export const DEFAULT_CHUNKER_CONFIG: Required<ChunkerConfig> = {
  chunkSize: 3500,
  overlapSentences: 1,
  chunkingMethod: "structure",
  minChunkChars: 30,
  pageMarkerTemplate: "[Halaman {page_number}]",
};

export const DEFAULT_RETRIEVAL_CONFIG: Omit<Required<RetrievalConfig>, "customStopwords"> & {
  customStopwords?: Set<string> | string[];
} = {
  topKSemantic: 10,
  topKLexical: 10,
  finalTopK: 10,
  rrfK: 60,
  maxDocFrequencyRatio: 0.1,
  minWordLength: 3,
};

export const DEFAULT_BATCHER_CONFIG: Required<BatcherConfig> = {
  batchBudgetChars: 40000,
};

export const DEFAULT_MODEL_CONFIG: Required<ModelConfig> = {
  embeddingModel: "google/embeddinggemma-300m",
  embeddingDimension: 768,
  llmModel: (typeof process !== "undefined" && process.env?.OPENAI_MODEL) || "",
  llmBaseUrl: (typeof process !== "undefined" && process.env?.OPENAI_BASE_URL) || "",
  llmApiKey: (typeof process !== "undefined" && process.env?.OPENAI_API_KEY) || "",
};

export const DEFAULT_CONFIG: Required<Omit<LakinEvalConfig, "customStopwords">> & {
  customStopwords?: Set<string> | string[];
} = {
  ...DEFAULT_CHUNKER_CONFIG,
  ...DEFAULT_RETRIEVAL_CONFIG,
  ...DEFAULT_BATCHER_CONFIG,
  ...DEFAULT_MODEL_CONFIG,
};

/**
 * Menggabungkan konfigurasi kustom dengan nilai default
 */
export function resolveConfig(custom?: Partial<LakinEvalConfig>): typeof DEFAULT_CONFIG {
  return {
    ...DEFAULT_CONFIG,
    ...custom,
  };
}
