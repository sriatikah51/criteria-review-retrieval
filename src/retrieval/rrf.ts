import type { ChunkRow, RetrievalConfig } from "../types/index.js";
import { DEFAULT_RETRIEVAL_CONFIG } from "../config/defaults.js";

/**
 * Menggabungkan beberapa daftar kandidat berperingkat (semantic + lexical)
 * menggunakan Reciprocal Rank Fusion (RRF):
 * Score(d) = sum(1 / (k + rank))
 *
 * Parameter k (default: 60) mencegah hasil rank #1 di satu list mendominasi secara mutlak.
 */
export function applyRRF(
  rankedLists: ChunkRow[][],
  config?: RetrievalConfig
): ChunkRow[] {
  const k = config?.rrfK ?? DEFAULT_RETRIEVAL_CONFIG.rrfK;
  const finalTopK = config?.finalTopK ?? DEFAULT_RETRIEVAL_CONFIG.finalTopK;

  const scores = new Map<string, number>();
  const chunkById = new Map<string, ChunkRow>();

  for (const list of rankedLists) {
    list.forEach((row, index) => {
      const rank = index + 1; // 1-indexed
      scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (k + rank));
      if (!chunkById.has(row.id)) {
        chunkById.set(row.id, row);
      }
    });
  }

  const fused = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, score], rankIndex) => {
      const chunk = chunkById.get(id)!;
      return {
        ...chunk,
        score,
        rank: rankIndex + 1,
      };
    });

  return fused.slice(0, finalTopK);
}

/**
 * Mengurutkan kembali chunk hasil RRF berdasarkan urutan posisi fisik asli dalam dokumen (chunkIndex)
 * agar teks yang disajikan ke LLM terbaca berurutan dan koheren.
 */
export function sortByDocumentOrder(chunks: ChunkRow[]): ChunkRow[] {
  return [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
}
