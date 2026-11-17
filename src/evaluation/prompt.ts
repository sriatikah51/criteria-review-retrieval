import type { Criteria } from "../types/index.js";

export const DEFAULT_RAG_EVIDENCE_NOTE =
  "Catatan: teks di bawah ini BUKAN dokumen utuh secara berurutan, melainkan kumpulan potongan paling relevan hasil pencarian otomatis dari dokumen untuk kriteria-kriteria di atas. Nilai tiap kriteria berdasarkan bukti yang tersedia di potongan-potongan ini.";

/**
 * Membangun prompt evaluasi LLM (model apa pun yang menerima satu pesan teks
 * dan dapat mengembalikan JSON).
 * Secara ketat menginstruksikan model untuk mengambil nomor halaman dari penanda fisik
 * "[Halaman N]" dan MENGABAIKAN nomor halaman cetak yang tampak di footer/header dokumen.
 */
export function buildEvaluationPrompt(
  documentText: string,
  criteriaList: Criteria[],
  note = DEFAULT_RAG_EVIDENCE_NOTE
): string {
  const criteriaText = criteriaList.map((c) => `- ${c.code}: ${c.description}`).join("\n");
  const noteBlock = note ? `\n\n${note}` : "";

  return `Kamu adalah evaluator dokumen LAKIN (Laporan Kinerja Instansi). Evaluasi dokumen berikut terhadap setiap kriteria yang diberikan.

Dokumen di bawah berisi penanda "[Halaman N]" di awal setiap halaman. N adalah nomor urut halaman FISIK di dalam file PDF (halaman ke-N dihitung dari sampul/awal file) - PENTING: ini SERING BERBEDA dari nomor halaman yang tercetak di dalam teks dokumen itu sendiri (misal di footer/header setiap halaman), karena bagian depan laporan (sampul, daftar isi, ringkasan eksekutif) biasanya diberi angka romawi atau tidak diberi nomor sebelum penomoran utama "1, 2, 3, ..." dimulai - sehingga halaman fisik ke-46 bisa saja tercetak sebagai "27" di footer-nya.

Untuk evidence_page, WAJIB pakai angka dari penanda "[Halaman N]" terdekat sebelum kutipan. JANGAN PERNAH memakai angka halaman yang terlihat tercetak di dalam isi teks dokumen (contoh: kalau ada teks footer seperti "...Laporan Kinerja...|27|", abaikan angka "27" itu sama sekali - itu bukan penanda "[Halaman N]"). JANGAN menebak nomor halaman kalau penanda "[Halaman N]" tidak ada di dekat kutipan.

Untuk setiap kriteria, tentukan:
- verdict: "ya" jika dokumen memenuhi kriteria (termasuk memenuhi sebagian - ada bukti nyata walau belum lengkap), atau "tidak" jika tidak ada bukti sama sekali / kriteria tidak terpenuhi.
- evidence_quote: kutipan langsung dari dokumen yang mendukung penilaian (kosongkan jika tidak ada).
- evidence_location: lokasi kutipan tersebut di dokumen (contoh: nama bab/bagian).
- evidence_page: nomor halaman FISIK PDF dari penanda "[Halaman N]" terdekat sebelum kutipan - BUKAN nomor yang tercetak di footer/header dokumen (contoh: "42", atau "42-43" kalau kutipan melewati batas halaman; kosongkan kalau tidak ada penanda halaman yang jelas).
- reasoning: alasan singkat penilaian.${noteBlock}

Kriteria:
${criteriaText}

Dokumen:
"""
${documentText}
"""

Kembalikan HANYA sebuah JSON object dengan bentuk persis berikut, tanpa teks lain:
{"results": [{"criteria_code": string, "verdict": "ya" | "tidak", "evidence_quote": string, "evidence_location": string, "evidence_page": string, "reasoning": string}]}

Sertakan satu entri untuk setiap kriteria_code yang diberikan.`;
}
