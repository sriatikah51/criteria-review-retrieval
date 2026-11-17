import type { TextChunk } from "../types/index.js";

/**
 * Menghindari pemotongan di tengah pasangan surrogate UTF-16
 */
export function snapToCodePointBoundary(text: string, index: number): number {
  const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
  const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
  if (
    index > 0 &&
    index < text.length &&
    isHighSurrogate(text.charCodeAt(index - 1)) &&
    isLowSurrogate(text.charCodeAt(index))
  ) {
    return index - 1;
  }
  return index;
}

/**
 * Singkatan bahasa Indonesia birokrasi yang diakhiri titik "." namun bukan akhir kalimat
 */
export const SENTENCE_ABBREVIATIONS = new Set([
  "no", "rp", "dr", "drs", "dra", "ir", "prof", "bpk", "ibu", "sdr", "sdri",
  "dll", "dst", "dsb", "tsb", "sbb", "dkk", "dgn", "yth", "cq", "qq",
  "jl", "kab", "kec", "kel", "prov", "kota", "rt", "rw",
  "s.d", "a.n", "u.p", "d.a", "u.b", "hal", "bab",
]);

function isAbbreviation(text: string, periodIndex: number): boolean {
  let start = periodIndex;
  while (start > 0 && /[a-zA-Z.]/.test(text[start - 1])) start--;
  while (start < periodIndex && text[start] === ".") start++;
  const candidate = text.slice(start, periodIndex).toLowerCase();
  return SENTENCE_ABBREVIATIONS.has(candidate);
}

/**
 * Titik di antara digit adalah pemisah ribuan/desimal (misal 1.000.000), bukan batas kalimat
 */
function isNumericPeriod(text: string, index: number): boolean {
  const before = text[index - 1];
  const after = text[index + 1];
  return before !== undefined && after !== undefined && /\d/.test(before) && /\d/.test(after);
}

/**
 * Memecah teks menjadi potongan kalimat dengan tetap menyimpan offset karakter aslinya.
 */
export function splitIntoSentences(text: string): TextChunk[] {
  const sentences: TextChunk[] = [];
  let start = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      let j = i;
      while (j < text.length && /[.!?]/.test(text[j])) j++; // gabungkan "..." atau "?!"
      const isPeriod = ch === ".";
      const nextChar = text[j];
      let isBoundary = nextChar === undefined || /\s/.test(nextChar);

      if (isPeriod && isBoundary) {
        if (isAbbreviation(text, i) || isNumericPeriod(text, i)) isBoundary = false;
        if (nextChar !== undefined && /[a-z]/.test(nextChar)) isBoundary = false;
      }

      if (isBoundary) {
        const content = text.slice(start, j).trim();
        if (content) sentences.push({ content, start });
        let k = j;
        while (k < text.length && /\s/.test(text[k])) k++;
        start = k;
        i = k;
        continue;
      }
      i = j;
      continue;
    }
    i++;
  }

  const rest = text.slice(start).trim();
  if (rest) sentences.push({ content: rest, start });
  return sentences;
}

/**
 * Mengelompokkan kalimat ke dalam chunk dengan batas maxChars dan overlap sejumlah kalimat.
 * Jika terdapat kalimat/tabel yang panjangnya melebihi maxChars, dilakukan force-split dengan aman.
 */
export function splitIntoSentenceChunks(
  text: string,
  maxChars: number,
  overlapSentences: number
): TextChunk[] {
  const rawSentences = splitIntoSentences(text);

  const sentences: TextChunk[] = [];
  for (const s of rawSentences) {
    if (s.content.length <= maxChars) {
      sentences.push(s);
      continue;
    }
    let offset = 0;
    while (offset < s.content.length) {
      const end = snapToCodePointBoundary(s.content, Math.min(offset + maxChars, s.content.length));
      sentences.push({ content: s.content.slice(offset, end), start: s.start + offset });
      offset = end;
    }
  }

  const chunks: TextChunk[] = [];
  let current: TextChunk[] = [];
  let currentLength = 0;

  function flush() {
    if (current.length === 0) return;
    chunks.push({ content: current.map((s) => s.content).join(" "), start: current[0].start });
  }

  for (const sentence of sentences) {
    const addedLength = sentence.content.length + 1; // +1 untuk spasi penggabung
    while (current.length > 0 && currentLength + addedLength > maxChars) {
      flush();
      const overlap = current.slice(-overlapSentences);
      const overlapLength = overlap.reduce((sum, s) => sum + s.content.length + 1, 0);
      if (overlapLength + addedLength > maxChars) {
        current = [];
        currentLength = 0;
      } else {
        current = overlap;
        currentLength = overlapLength;
      }
    }
    current.push(sentence);
    currentLength += addedLength;
  }
  flush();

  return chunks;
}

/**
 * Fallback pembagian tetap berdasarkan batas karakter dan paragraf (\n\n)
 */
export function splitIntoChunks(text: string, maxChars: number, overlapChars: number): TextChunk[] {
  if (text.length <= maxChars) return [{ content: text, start: 0 }];

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const searchStart = start + Math.floor(maxChars * 0.8);
      const boundary = text.lastIndexOf("\n\n", end);
      if (boundary > searchStart) {
        end = boundary;
      }
    }
    end = snapToCodePointBoundary(text, end);
    chunks.push({ content: text.slice(start, end), start });
    if (end >= text.length) break;
    start = snapToCodePointBoundary(text, Math.max(end - overlapChars, start + 1));
  }
  return chunks;
}
