import type { RetrievalConfig } from "../types/index.js";
import { DEFAULT_RETRIEVAL_CONFIG } from "../config/defaults.js";
import { extractCandidateWords } from "./stopwords.js";

export type DocumentFrequencyFunction = (word: string) => Promise<number> | number;

/**
 * Membangun query leksikal (OR-combined) dari kata-kata pembeda kriteria.
 * Kata yang muncul di lebih dari maxDocFrequencyRatio (default 10%) dari total chunk
 * dianggap terlalu umum (seperti "kinerja" atau "tahun") dan dieliminasi.
 */
export async function buildDistinctiveLexicalQuery(
  description: string,
  totalChunks: number,
  getDocumentFrequency: DocumentFrequencyFunction,
  config?: RetrievalConfig
): Promise<string | null> {
  const maxRatio = config?.maxDocFrequencyRatio ?? DEFAULT_RETRIEVAL_CONFIG.maxDocFrequencyRatio;
  const minLength = config?.minWordLength ?? DEFAULT_RETRIEVAL_CONFIG.minWordLength;
  const stopwords = config?.customStopwords;

  const candidates = extractCandidateWords(description, minLength, stopwords);
  const distinctive: string[] = [];

  for (const word of candidates) {
    const freq = await getDocumentFrequency(word);
    if (freq > 0 && totalChunks > 0 && freq / totalChunks <= maxRatio) {
      distinctive.push(word);
    }
  }

  return distinctive.length > 0 ? distinctive.join(" | ") : null;
}
