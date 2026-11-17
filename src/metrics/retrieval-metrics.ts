import type { RetrievalMetrics } from "../types/index.js";

/**
 * Menghitung metrik Information Retrieval (IR) untuk evaluasi retrieval chunk:
 * - Precision@K: irisan / K
 * - Recall@K: irisan / |groundTruth|
 * - F1: 2 * P * R / (P + R)
 * - Hit Rate: 1 jika ada minimal 1 chunk relevan di retrieved, jika tidak 0
 * - Normalized Recall: irisan / R, dengan R = min(K, |groundTruth|)
 * - R-Precision: presisi pada top-R sesuai urutan ranking RRF
 *
 * Dua aturan nilai kosong, dan keduanya sengaja berbeda:
 *
 * 1. Ground truth TIDAK kosong tetapi tak ada chunk yang dikembalikan - ini
 *    kegagalan yang terukur, bukan data yang hilang. Precision, recall
 *    ternormalisasi, dan R-Precision bernilai 0, tidak pernah null, sehingga
 *    kasusnya ikut penyebut rata-rata dan kegagalannya tidak tersembunyi.
 * 2. Ground truth kosong (anotator menyatakan "memang tidak ada bukti") -
 *    tidak ada yang bisa diukur, sebab tak ada sesuatu pun yang seharusnya
 *    ditemukan. SELURUH metrik null, termasuk precision, sehingga kasusnya
 *    keluar dari penyebut rata-rata alih-alih menyumbang angka 0 yang
 *    menyeret precision turun tanpa dasar.
 *
 * Parameter `k` adalah jumlah chunk yang DIMINTA (k_final pada konfigurasi
 * retrieval), bukan jumlah yang kebetulan dikembalikan. Keduanya berbeda
 * ketika sebuah lengan gagal mengisi seluruh K - misalnya kueri leksikal yang
 * kosong, atau dokumen yang potongannya lebih sedikit dari K. Bila `k`
 * dihilangkan, nilainya jatuh ke jumlah chunk unik yang dikembalikan, sehingga
 * pemanggil lama menghasilkan angka yang persis sama seperti sebelumnya.
 *
 * Mengapa K penting: dengan penyebut `|retrieved|`, sistem yang mengembalikan
 * 3 chunk dan ketiganya relevan memperoleh precision 1,0 dan recall
 * ternormalisasi 1,0 - angka yang sama dengan sistem yang mengembalikan 10
 * chunk dan kesepuluhnya relevan. Keduanya tidak setara, dan penyebut K yang
 * membedakannya. Pada `|retrieved| <= |groundTruth|` penyebut lama bahkan
 * membuat precision, recall ternormalisasi, dan R-Precision runtuh menjadi
 * satu angka yang identik.
 *
 * Catatan penting: `retrievedIds` HARUS dalam urutan peringkat relevansi RRF
 * (rank 1 pertama) agar perhitungan R-Precision valid.
 */
export function computeRetrievalMetrics(
  retrievedIds: string[],
  groundTruthIds: string[],
  k?: number
): RetrievalMetrics {
  if (k !== undefined && (!Number.isInteger(k) || k < 0)) {
    // K yang tidak masuk akal adalah kekeliruan pemanggil, bukan keadaan data.
    // Dilempar, bukan diperbaiki diam-diam, supaya tidak ada angka metrik yang
    // tampak sah padahal penyebutnya salah.
    throw new RangeError(`k harus bilangan bulat >= 0, diterima: ${k}`);
  }

  // Deduplikasi kedua sisi sebelum menghitung. Tanpa ini penyebutnya tidak
  // setara: ground truth otomatis terdeduplikasi oleh Set, sedangkan
  // retrievedIds memakai panjang larik mentah - sehingga satu id yang muncul
  // dua kali menurunkan precision tanpa alasan. Urutan peringkat dipertahankan
  // (kemunculan pertama menang), karena R-Precision bergantung padanya.
  const seen = new Set<string>();
  const uniqueRetrieved = retrievedIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const effectiveK = k ?? uniqueRetrieved.length;

  // Metrik @K hanya memandang K peringkat teratas. Pemotongan ini tidak pernah
  // aktif saat `k` dihilangkan (K = jumlah yang dikembalikan), dan mencegah
  // precision melampaui 1 bila pemanggil mengembalikan lebih banyak dari K.
  const evaluated =
    effectiveK < uniqueRetrieved.length ? uniqueRetrieved.slice(0, effectiveK) : uniqueRetrieved;

  if (groundTruthIds.length === 0) {
    // Kasus "tidak ada bukti" (aturan 2 di atas): tak ada apa pun yang
    // seharusnya ditemukan, jadi tak ada yang dapat diukur - termasuk
    // precision. Sebelumnya precision diisi 0 di sini, dan nol itu masuk
    // penyebut rata-rata sehingga menurunkan precision seluruh lengan tanpa
    // ada kegagalan retrieval yang nyata.
    return {
      precision: null,
      recall: null,
      f1: null,
      hit: null,
      recallNormalized: null,
      precisionAtR: null,
    };
  }

  const groundTruthSet = new Set(groundTruthIds);
  const groundTruthCount = groundTruthSet.size;
  const intersection = evaluated.filter((id) => groundTruthSet.has(id));

  // Mulai dari sini ground truth pasti berisi, jadi menurut aturan 1 tak ada
  // satu pun metrik yang boleh null - kegagalan total bernilai 0.
  const precision = effectiveK > 0 ? intersection.length / effectiveK : 0;
  const recall = intersection.length / groundTruthCount;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const hit = intersection.length > 0 ? 1 : 0;

  // R = min(K, |ground truth|): batas maksimal yang mungkin dicapai sistem
  const r = Math.min(effectiveK, groundTruthCount);
  const recallNormalized = r > 0 ? intersection.length / r : 0;

  // R-Precision: presisi pada top-R peringkat pertama. Bila yang dikembalikan
  // kurang dari R, slot yang kosong dihitung sebagai tidak relevan - penyebut
  // tetap R.
  const topR = evaluated.slice(0, r);
  const topRMatches = topR.filter((id) => groundTruthSet.has(id)).length;
  const precisionAtR = r > 0 ? topRMatches / r : 0;

  return {
    precision,
    recall,
    f1,
    hit,
    recallNormalized,
    precisionAtR,
  };
}
