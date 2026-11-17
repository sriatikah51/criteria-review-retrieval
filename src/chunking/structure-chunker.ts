import type { ChunkerConfig, LabeledChunk, TextChunk } from "../types/index.js";
import { DEFAULT_CHUNKER_CONFIG } from "../config/defaults.js";
import {
  buildPageMarkerIndex,
  pageAtOffset,
  formatPageMarker,
  STARTS_WITH_PAGE_MARKER,
} from "./page-marker.js";
import {
  splitIntoChunks,
  splitIntoSentenceChunks,
} from "./sentence-chunker.js";

/**
 * Regex judul BAB resmi: membedakan "BAB I", "BAB II" asli dari daftar isi ("Bab I ...")
 * atau penyebutan narasi teks ("Bab I. pada bab ini...")
 */
export const BAB_HEADING_REGEX = /\bBAB\s+[IVXLCDM]+\b(?!\.\s+[a-z])/g;

/**
 * Memecah teks dokumen LAKIN berdasarkan batas BAB (Pendahuluan, Perencanaan Kinerja,
 * Akuntabilitas Kinerja, Penutup). Jika satu BAB melebihi maxChars, dilakukan
 * pemecahan lanjutan berbasis kalimat (splitIntoSentenceChunks).
 */
export function splitIntoStructureChunks(
  text: string,
  maxChars = DEFAULT_CHUNKER_CONFIG.chunkSize,
  overlapSentences = DEFAULT_CHUNKER_CONFIG.overlapSentences
): TextChunk[] {
  const boundaries = Array.from(text.matchAll(BAB_HEADING_REGEX)).map((m) => m.index ?? 0);
  if (boundaries.length === 0) {
    return splitIntoSentenceChunks(text, maxChars, overlapSentences);
  }

  const segments: { start: number; end: number }[] = [];
  if (boundaries[0] > 0) {
    segments.push({ start: 0, end: boundaries[0] });
  }
  for (let i = 0; i < boundaries.length; i++) {
    segments.push({
      start: boundaries[i],
      end: i + 1 < boundaries.length ? boundaries[i + 1] : text.length,
    });
  }

  const chunks: TextChunk[] = [];
  for (const segment of segments) {
    const segmentText = text.slice(segment.start, segment.end);
    if (!segmentText.trim()) continue;
    if (segmentText.length <= maxChars) {
      chunks.push({ content: segmentText, start: segment.start });
      continue;
    }
    for (const sub of splitIntoSentenceChunks(segmentText, maxChars, overlapSentences)) {
      chunks.push({ content: sub.content, start: segment.start + sub.start });
    }
  }
  return chunks;
}

/**
 * Memecah teks menjadi chunk dan melabeli setiap chunk dengan nomor halaman fisik PDF-nya.
 * Membuang chunk yang terlalu pendek/kosong (kurang dari minChunkChars).
 */
export function buildLabeledChunks(
  text: string,
  config?: ChunkerConfig
): LabeledChunk[] {
  const resolved = {
    ...DEFAULT_CHUNKER_CONFIG,
    ...config,
  };

  const pageMarkers = buildPageMarkerIndex(text);
  const rawChunks =
    resolved.chunkingMethod === "structure"
      ? splitIntoStructureChunks(text, resolved.chunkSize, resolved.overlapSentences)
      : resolved.chunkingMethod === "sentence"
        ? splitIntoSentenceChunks(text, resolved.chunkSize, resolved.overlapSentences)
        : splitIntoChunks(text, resolved.chunkSize, resolved.overlapSentences);

  return rawChunks
    .filter((chunk) => chunk.content.replace(/\s/g, "").length >= resolved.minChunkChars)
    .map((chunk, chunkIndex) => {
      const page = pageAtOffset(pageMarkers, chunk.start);
      const prefix = page !== null ? `${formatPageMarker(page, resolved.pageMarkerTemplate)}\n\n` : "";
      const content =
        page !== null && !STARTS_WITH_PAGE_MARKER.test(chunk.content)
          ? `${prefix}${chunk.content}`
          : chunk.content;
      return { content, chunkIndex, page };
    });
}
