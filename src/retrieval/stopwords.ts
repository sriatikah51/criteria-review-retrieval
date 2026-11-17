import { DEFAULT_RETRIEVAL_CONFIG } from "../config/defaults.js";

/**
 * Daftar kata tugas struktural bahasa Indonesia yang difilter dari pencarian kata kunci.
 */
export const DEFAULT_INDONESIAN_STOPWORDS = new Set([
  "dan", "yang", "telah", "di", "ke", "dari", "untuk", "pada", "dengan", "atau",
  "ini", "itu", "akan", "adalah", "oleh", "dalam", "secara", "atas", "sudah",
  "juga", "serta", "guna", "agar", "maka", "bahwa", "tersebut", "sebagai",
  "tidak", "tanpa", "hingga", "sampai", "karena", "jika", "kalau", "apabila",
  "dapat", "harus", "sedang", "masih", "saja", "pun", "lah", "kah", "memuat",
]);

/**
 * Mengekstrak kata-kata kandidat pencarian dari deskripsi kriteria
 */
export function extractCandidateWords(
  text: string,
  minWordLength = DEFAULT_RETRIEVAL_CONFIG.minWordLength,
  customStopwords?: Set<string> | string[]
): string[] {
  const stopwords = customStopwords
    ? customStopwords instanceof Set
      ? customStopwords
      : new Set(customStopwords)
    : DEFAULT_INDONESIAN_STOPWORDS;

  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return Array.from(
    new Set(words.filter((w) => w.length >= minWordLength && !stopwords.has(w)))
  );
}
