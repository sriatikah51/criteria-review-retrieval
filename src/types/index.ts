/**
 * Domain types for LAKIN Evaluation Flow
 */

export type Verdict = "ya" | "tidak";

export interface Criteria {
  id: string;
  code: string;
  description: string;
  isActive?: boolean;
}

export interface TextChunk {
  content: string;
  start: number;
}

export interface LabeledChunk {
  content: string;
  chunkIndex: number;
  page?: number | null;
}

export interface ChunkRow {
  id: string;
  chunkIndex: number;
  content: string;
  score?: number;
  rank?: number;
}

export interface EvaluationResultItem {
  criteria_code: string;
  verdict: Verdict;
  evidence_quote: string;
  evidence_location: string;
  evidence_page: string;
  reasoning: string;
}

export interface CriteriaBatch {
  criteria: Criteria[];
  context: string;
  chunkIdsByCriteriaCode: Record<string, string[]>;
}

export interface RetrievalMetrics {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  hit: number | null;
  recallNormalized: number | null;
  precisionAtR: number | null;
}

export interface VerdictMetrics {
  total: number;
  scored: number;
  skipped: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  /** TN / (TN + FP). Null bila tidak ada kasus berlabel negatif. */
  specificity: number | null;
  /**
   * Akurasi penebak kelas mayoritas pada ground truth yang sama. Pembanding
   * wajib ketika label sangat tidak berimbang - sistem yang selalu menjawab
   * satu kelas akan tampak sempurna tanpa pembanding ini.
   */
  majorityBaselineAccuracy: number | null;
  /** Kelas mayoritas pada ground truth; null bila seimbang atau tidak ada kasus. */
  majorityClass: Verdict | null;
  /** Cohen's kappa antara putusan model dan ground truth. */
  kappa: number | null;
}

/** Hasil perhitungan kesepakatan antar dua penilai. */
export interface AgreementMetrics {
  /** Jumlah kasus yang dinilai oleh KEDUA pihak. */
  overlap: number;
  /** Proporsi kasus yang labelnya sama. */
  observedAgreement: number | null;
  /** Kesepakatan yang diharapkan muncul secara kebetulan. */
  expectedAgreement: number | null;
  /**
   * Cohen's kappa. Null bila tidak terdefinisi - yaitu ketika kedua penilai
   * memakai satu kelas saja, sehingga expectedAgreement = 1 dan penyebutnya nol.
   */
  kappa: number | null;
}

export type ChunkingMethod = "structure" | "sentence" | "fixed";

export interface ChunkerConfig {
  chunkSize?: number;
  overlapSentences?: number;
  chunkingMethod?: ChunkingMethod;
  minChunkChars?: number;
  pageMarkerTemplate?: string;
}

export interface RetrievalConfig {
  topKSemantic?: number;
  topKLexical?: number;
  finalTopK?: number;
  rrfK?: number;
  maxDocFrequencyRatio?: number;
  minWordLength?: number;
  customStopwords?: Set<string> | string[];
}

export interface BatcherConfig {
  batchBudgetChars?: number;
}

export interface ModelConfig {
  embeddingModel?: string;
  embeddingDimension?: number;
  llmModel?: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
}

export interface LakinEvalConfig extends ChunkerConfig, RetrievalConfig, BatcherConfig, ModelConfig {}
