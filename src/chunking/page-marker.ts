export interface PageMarker {
  offset: number;
  page: number;
}

export const PAGE_MARKER_REGEX = /\[Halaman (\d+)\]/g;
export const STARTS_WITH_PAGE_MARKER = /^\s*\[Halaman \d+\]/;

/**
 * Membangun indeks posisi penanda [Halaman N] dari teks dokumen yang diekstrak.
 */
export function buildPageMarkerIndex(text: string): PageMarker[] {
  return Array.from(text.matchAll(PAGE_MARKER_REGEX)).map((match) => ({
    offset: match.index ?? 0,
    page: Number(match[1]),
  }));
}

/**
 * Menemukan nomor halaman fisik PDF berdasarkan offset karakter di dalam dokumen.
 */
export function pageAtOffset(markers: PageMarker[], offset: number): number | null {
  let page: number | null = null;
  for (const marker of markers) {
    if (marker.offset > offset) break;
    page = marker.page;
  }
  return page;
}

/**
 * Format string penanda halaman berdasarkan template
 */
export function formatPageMarker(page: number, template = "[Halaman {page_number}]"): string {
  return template.replace("{page_number}", String(page));
}
