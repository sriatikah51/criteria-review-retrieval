import type { EvaluationResultItem, Verdict } from "../types/index.js";

const VALID_VERDICTS: Set<Verdict> = new Set(["ya", "tidak"]);
const VERDICT_RANK: Record<Verdict, number> = { ya: 1, tidak: 0 };

/**
 * Mengekstrak dan mem-parse JSON dari teks balasan LLM yang mungkin berisi
 * markdown code block (```json ... ```) atau teks pengantar lainnya.
 */
export function parseModelJson(raw: string): unknown {
  const attempts = [raw];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) attempts.push(fenced[1]);

  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    attempts.push(raw.slice(braceStart, braceEnd + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt.trim());
    } catch {
      // coba opsi ekstraksi berikutnya
    }
  }
  return undefined;
}

export function isValidResultItem(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const record = item as Record<string, unknown>;
  return (
    typeof record.criteria_code === "string" &&
    typeof record.verdict === "string" &&
    VALID_VERDICTS.has(record.verdict.toLowerCase() as Verdict) &&
    typeof record.evidence_quote === "string" &&
    typeof record.evidence_location === "string" &&
    typeof record.reasoning === "string"
  );
}

export function normalizeResultItem(item: unknown): EvaluationResultItem {
  const record = item as Record<string, unknown>;
  const verdictRaw = String(record.verdict ?? "").toLowerCase();
  const verdict: Verdict = verdictRaw === "ya" ? "ya" : "tidak";

  return {
    criteria_code: String(record.criteria_code ?? ""),
    verdict,
    evidence_quote: typeof record.evidence_quote === "string" ? record.evidence_quote : "",
    evidence_location: typeof record.evidence_location === "string" ? record.evidence_location : "",
    evidence_page: typeof record.evidence_page === "string" ? record.evidence_page : "",
    reasoning: typeof record.reasoning === "string" ? record.reasoning : "",
  };
}

/**
 * Memvalidasi dan menormalkan array hasil evaluasi dari objek JSON LLM
 */
export function extractEvaluationResults(parsed: unknown): EvaluationResultItem[] {
  if (!parsed || typeof parsed !== "object") return [];
  const results = (parsed as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];

  return results.filter(isValidResultItem).map(normalizeResultItem);
}

/**
 * Menggabungkan hasil evaluasi dari beberapa chunk/bagian dokumen.
 * Jika suatu kriteria dinilai "ya" pada satu bagian, penilaian "ya" tersebut diprioritaskan.
 */
export function mergeChunkResults(
  chunkResultsList: EvaluationResultItem[][]
): EvaluationResultItem[] {
  const byCode = new Map<string, EvaluationResultItem>();
  for (const items of chunkResultsList) {
    for (const item of items) {
      const existing = byCode.get(item.criteria_code);
      if (!existing || VERDICT_RANK[item.verdict] > VERDICT_RANK[existing.verdict]) {
        byCode.set(item.criteria_code, item);
      }
    }
  }
  return Array.from(byCode.values());
}
