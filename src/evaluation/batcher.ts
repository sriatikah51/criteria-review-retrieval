import type { BatcherConfig, ChunkRow, Criteria, CriteriaBatch } from "../types/index.js";
import { DEFAULT_BATCHER_CONFIG } from "../config/defaults.js";
import { sortByDocumentOrder } from "../retrieval/rrf.js";

/**
 * Mengelompokkan kriteria ke dalam batch yang pas untuk satu panggilan LLM (default ~40.000 karakter).
 * Satu kriteria BESERTA seluruh bukti chunk-nya tidak pernah dipecah ke dua batch berbeda,
 * sehingga evaluasi tiap kriteria selalu mandiri dan tidak memerlukan rekonsiliasi parsial.
 */
export function buildCriteriaBatches(
  criteriaList: Criteria[],
  chunksByCriteria: ChunkRow[][],
  config?: BatcherConfig
): CriteriaBatch[] {
  const budgetChars = config?.batchBudgetChars ?? DEFAULT_BATCHER_CONFIG.batchBudgetChars;

  const batches: CriteriaBatch[] = [];
  let batchCriteria: Criteria[] = [];
  let batchChunks = new Map<string, ChunkRow>();
  let batchChunkIdsByCriteriaCode: Record<string, string[]> = {};
  let batchChars = 0;

  function flushBatch() {
    if (batchCriteria.length === 0) return;
    const sortedChunks = sortByDocumentOrder(Array.from(batchChunks.values()));
    const context = sortedChunks.map((c) => c.content).join("\n\n");
    batches.push({
      criteria: batchCriteria,
      context,
      chunkIdsByCriteriaCode: batchChunkIdsByCriteriaCode,
    });
    batchCriteria = [];
    batchChunks = new Map();
    batchChunkIdsByCriteriaCode = {};
    batchChars = 0;
  }

  for (let i = 0; i < criteriaList.length; i++) {
    const criterion = criteriaList[i];
    const chunks = chunksByCriteria[i] ?? [];
    const newChars = chunks
      .filter((c) => !batchChunks.has(c.id))
      .reduce((sum, c) => sum + c.content.length, 0);

    if (batchCriteria.length > 0 && batchChars + newChars > budgetChars) {
      flushBatch();
    }

    batchCriteria.push(criterion);
    batchChunkIdsByCriteriaCode[criterion.code] = chunks.map((c) => c.id);
    for (const chunk of chunks) {
      if (!batchChunks.has(chunk.id)) {
        batchChunks.set(chunk.id, chunk);
        batchChars += chunk.content.length;
      }
    }
  }
  flushBatch();

  return batches;
}
