import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeRetrievalMetrics,
  computeVerdictMetrics,
  computeCohenKappa,
} from "../src/metrics/index.js";
import type { Verdict } from "../src/types/index.js";

/**
 * Replika rumus LAMA pada scripts/evaluate-retrieval.ts sebelum deduplikasi
 * diterapkan. Dipakai untuk uji kesetaraan: pada masukan tanpa duplikat,
 * pustaka harus menghasilkan angka yang persis sama, sehingga perbaikan dedup
 * terbukti tidak mengubah hasil kasus yang sudah ada.
 */
function rumusLama(retrievedIds: string[], groundTruthIds: string[]) {
  if (groundTruthIds.length === 0) {
    return {
      precision: retrievedIds.length > 0 ? 0 : null,
      recall: null,
      f1: null,
      hit: null,
      recallNormalized: null,
      precisionAtR: null,
    };
  }
  const gt = new Set(groundTruthIds);
  const irisan = retrievedIds.filter((id) => gt.has(id));
  const precision = retrievedIds.length > 0 ? irisan.length / retrievedIds.length : 0;
  const recall = irisan.length / groundTruthIds.length;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const r = Math.min(retrievedIds.length, groundTruthIds.length);
  return {
    precision,
    recall,
    f1,
    hit: irisan.length > 0 ? 1 : 0,
    recallNormalized: r > 0 ? irisan.length / r : null,
    precisionAtR: r > 0 ? retrievedIds.slice(0, r).filter((id) => gt.has(id)).length / r : null,
  };
}

describe("computeRetrievalMetrics - kasus batas", () => {
  it("|GT| = 0: SELURUH metrik null, termasuk precision", () => {
    const m = computeRetrievalMetrics(["a", "b"], []);
    assert.equal(
      m.precision,
      null,
      "tak ada bukti yang seharusnya ditemukan -> tak ada yang bisa diukur"
    );
    assert.equal(m.recall, null);
    assert.equal(m.f1, null);
    assert.equal(m.hit, null);
    assert.equal(m.recallNormalized, null);
    assert.equal(m.precisionAtR, null);
  });

  it("|GT| = 0 dan tidak mengambil apa pun: tetap seluruhnya null", () => {
    const m = computeRetrievalMetrics([], []);
    assert.equal(m.precision, null);
    assert.equal(m.hit, null);
  });

  it("|GT| = 0 dengan K eksplisit: K tidak membuat metrik apa pun terdefinisi", () => {
    const m = computeRetrievalMetrics(["a", "b"], [], 10);
    assert.equal(m.precision, null, "K besar tidak mengubah fakta bahwa tak ada bukti");
    assert.equal(m.recallNormalized, null);
    assert.equal(m.precisionAtR, null);
  });

  it("|GT| > K: recall terkunci di bawah 1, recall ternormalisasi mencapai 1", () => {
    const retrieved = ["a", "b", "c"];
    const gt = ["a", "b", "c", "d", "e", "f"];
    const m = computeRetrievalMetrics(retrieved, gt);

    assert.equal(m.precision, 1, "ketiga hasil relevan");
    assert.equal(m.recall, 3 / 6, "recall mustahil 1 karena |GT| > K");
    assert.equal(m.recallNormalized, 1, "R = min(3, 6) = 3, seluruhnya ditemukan");
    assert.equal(m.precisionAtR, 1);
    assert.equal(m.hit, 1);
  });

  it("|GT| < K: precision terkunci rendah, R-Precision tetap 1", () => {
    const retrieved = ["a", "x", "y", "z", "w"];
    const gt = ["a"];
    const m = computeRetrievalMetrics(retrieved, gt);

    assert.equal(m.precision, 1 / 5, "sistem tetap mengambil K walau bukti hanya satu");
    assert.equal(m.recall, 1, "satu-satunya bukti ditemukan");
    assert.equal(m.recallNormalized, 1);
    assert.equal(m.precisionAtR, 1, "R = 1, peringkat teratas memang relevan");
  });

  it("GT berisi duplikat: penyebut recall memakai ukuran himpunan, bukan panjang larik", () => {
    const retrieved = ["a", "b"];
    const gt = ["a", "a", "a", "b"]; // hanya dua id berbeda
    const m = computeRetrievalMetrics(retrieved, gt);

    assert.equal(m.recall, 1, "kedua bukti unik ditemukan -> recall 1, bukan 2/4");
    assert.equal(m.precision, 1);
    assert.equal(m.recallNormalized, 1);
  });

  it("retrieved berisi duplikat: dideduplikasi sebelum dihitung", () => {
    const retrieved = ["a", "a", "a", "b"]; // dua id berbeda
    const gt = ["a", "b"];
    const m = computeRetrievalMetrics(retrieved, gt);

    assert.equal(m.precision, 1, "dua unik, dua relevan -> precision 1, bukan 2/4");
    assert.equal(m.recall, 1);
    assert.equal(m.precisionAtR, 1);
  });

  it("hasil kosong dengan GT berisi: SELURUH metrik nol, tak satu pun null", () => {
    const m = computeRetrievalMetrics([], ["a", "b"]);
    assert.equal(m.precision, 0);
    assert.equal(m.recall, 0);
    assert.equal(m.f1, 0);
    assert.equal(m.hit, 0);
    assert.equal(
      m.recallNormalized,
      0,
      "gagal total adalah 0 yang terukur, bukan nilai yang hilang"
    );
    assert.equal(m.precisionAtR, 0);
  });

  it("tidak ada irisan sama sekali", () => {
    const m = computeRetrievalMetrics(["x", "y"], ["a", "b"]);
    assert.equal(m.hit, 0);
    assert.equal(m.precision, 0);
    assert.equal(m.recall, 0);
    assert.equal(m.f1, 0);
  });

  it("urutan peringkat menentukan R-Precision", () => {
    const gt = ["a", "b"];
    const benarDiAtas = computeRetrievalMetrics(["a", "b", "x", "y"], gt);
    const benarDiBawah = computeRetrievalMetrics(["x", "y", "a", "b"], gt);

    assert.equal(benarDiAtas.precisionAtR, 1, "dua teratas relevan");
    assert.equal(benarDiBawah.precisionAtR, 0, "dua teratas tidak relevan");
    assert.equal(
      benarDiAtas.recall,
      benarDiBawah.recall,
      "recall tidak peka urutan, R-Precision peka"
    );
  });
});

describe("computeRetrievalMetrics - parameter K eksplisit", () => {
  it("K dihilangkan: penyebut jatuh ke jumlah yang dikembalikan (perilaku lama)", () => {
    const retrieved = ["a", "b", "c"];
    const gt = ["a", "b", "c", "d", "e", "f"];
    assert.deepEqual(
      computeRetrievalMetrics(retrieved, gt),
      computeRetrievalMetrics(retrieved, gt, 3),
      "K = jumlah yang dikembalikan harus identik dengan K dihilangkan"
    );
  });

  it("dikembalikan kurang dari K: penyebut tetap K, bukan jumlah yang terisi", () => {
    // Lengan leksikal mengembalikan 3 dari 10 yang diminta; ketiganya relevan.
    const retrieved = ["a", "b", "c"];
    const gt = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
    const m = computeRetrievalMetrics(retrieved, gt, 10);

    assert.equal(m.precision, 3 / 10, "irisan / K, bukan irisan / 3");
    assert.equal(m.recall, 3 / 12, "recall tidak bergantung pada K");
    assert.equal(m.recallNormalized, 3 / 10, "R = min(10, 12) = 10");
    assert.equal(m.precisionAtR, 3 / 10, "tujuh slot kosong dihitung tidak relevan");
    assert.equal(m.hit, 1);
  });

  it("dikembalikan kurang dari K: ketiga metrik TIDAK lagi runtuh menjadi satu angka", () => {
    const retrieved = ["a", "x", "b"];
    const gt = ["a", "b", "c", "d"];

    const lama = computeRetrievalMetrics(retrieved, gt);
    assert.equal(lama.precision, 2 / 3);
    assert.equal(lama.recallNormalized, 2 / 3);
    assert.equal(lama.precisionAtR, 2 / 3, "tanpa K ketiganya identik");

    const baru = computeRetrievalMetrics(retrieved, gt, 10);
    assert.equal(baru.precision, 2 / 10);
    assert.equal(baru.recallNormalized, 2 / 4, "R = min(10, 4) = 4");
    assert.equal(baru.precisionAtR, 2 / 4, "top-4 berisi dua relevan dari empat slot");
    assert.notEqual(baru.precision, baru.recallNormalized);
  });

  it("nol chunk dikembalikan dengan K eksplisit: nol, bukan null", () => {
    const m = computeRetrievalMetrics([], ["a", "b"], 10);
    assert.equal(m.precision, 0, "K = 10 > 0, jadi penyebutnya ada");
    assert.equal(m.recall, 0);
    assert.equal(m.f1, 0);
    assert.equal(m.hit, 0);
    assert.equal(m.recallNormalized, 0, "R = min(10, 2) = 2, irisan 0 -> 0 bukan null");
    assert.equal(m.precisionAtR, 0);
  });

  it("nol chunk dan GT kosong dengan K eksplisit: seluruhnya null", () => {
    const m = computeRetrievalMetrics([], [], 10);
    assert.equal(m.precision, null, "tak ada bukti -> tak ada yang diukur");
    assert.equal(m.recall, null);
    assert.equal(m.hit, null);
  });

  it("K = 0 dengan GT berisi: nol di mana-mana, bukan null", () => {
    const m = computeRetrievalMetrics(["a"], ["a", "b"], 0);
    assert.equal(m.precision, 0, "tak ada slot yang dinilai");
    assert.equal(m.recall, 0, "tak ada yang dinilai -> tak ada yang ditemukan");
    assert.equal(m.hit, 0);
    assert.equal(m.recallNormalized, 0, "R = min(0, 2) = 0, tetapi GT berisi -> 0");
    assert.equal(m.precisionAtR, 0);
  });

  it("dikembalikan lebih banyak dari K: dipotong ke top-K, precision tak melebihi 1", () => {
    const retrieved = ["a", "b", "c", "d"];
    const gt = ["a", "b", "c", "d"];
    const m = computeRetrievalMetrics(retrieved, gt, 2);

    assert.equal(m.precision, 1, "dua teratas relevan dari dua slot");
    assert.equal(m.recall, 2 / 4, "hanya dua yang dinilai dari empat bukti");
    assert.ok(m.precision !== null && m.precision <= 1);
  });

  it("K tidak valid ditolak, tidak dihitung diam-diam", () => {
    assert.throws(() => computeRetrievalMetrics(["a"], ["a"], -1), RangeError);
    assert.throws(() => computeRetrievalMetrics(["a"], ["a"], 2.5), RangeError);
    assert.throws(() => computeRetrievalMetrics(["a"], ["a"], Number.NaN), RangeError);
  });

  it("duplikat dibuang sebelum pemotongan top-K", () => {
    const m = computeRetrievalMetrics(["a", "a", "b"], ["a", "b"], 2);
    assert.equal(m.precision, 1, "dua unik mengisi dua slot, keduanya relevan");
    assert.equal(m.recall, 1);
  });
});

describe("computeRetrievalMetrics - kesetaraan dengan rumus lama", () => {
  // Kasus dengan ground truth berisi DAN hasil berisi tetap identik dengan
  // rumus lama ketika K dihilangkan - perbaikan K dan aturan nilai kosong
  // tidak menggeser angka kasus semacam ini.
  const kasusTanpaDuplikat: [string[], string[]][] = [
    [["a", "b", "c"], ["a", "d"]],
    [["a", "b", "c", "d", "e"], ["a", "b", "c", "d", "e", "f", "g"]],
    [["x"], ["a", "b", "c"]],
    [["a", "b"], ["b"]],
    [[], []],
  ];

  for (const [retrieved, gt] of kasusTanpaDuplikat) {
    it(`identik pada retrieved=[${retrieved}] gt=[${gt}]`, () => {
      assert.deepEqual(computeRetrievalMetrics(retrieved, gt), rumusLama(retrieved, gt));
    });
  }

  // Dua kasus di bawah SENGAJA berbeda dari rumus lama. Keduanya dicatat di
  // sini supaya perubahan semantiknya terbaca sebagai keputusan, bukan regresi
  // yang lolos tanpa disadari.
  it("beda disengaja: GT kosong, precision null (dahulu 0)", () => {
    assert.equal(rumusLama(["a", "b"], []).precision, 0, "rumus lama");
    assert.equal(computeRetrievalMetrics(["a", "b"], []).precision, null, "rumus baru");
  });

  it("beda disengaja: GT berisi tanpa hasil, Rnorm dan RP nol (dahulu null)", () => {
    const lama = rumusLama([], ["a"]);
    const baru = computeRetrievalMetrics([], ["a"]);
    assert.equal(lama.recallNormalized, null, "rumus lama");
    assert.equal(lama.precisionAtR, null, "rumus lama");
    assert.equal(baru.recallNormalized, 0, "rumus baru");
    assert.equal(baru.precisionAtR, 0, "rumus baru");
  });
});

describe("computeVerdictMetrics", () => {
  const kasus = (correct: Verdict, llm: Verdict | null) => ({
    correctVerdict: correct,
    llmVerdict: llm,
  });

  it("kelas positif adalah 'ya'", () => {
    const m = computeVerdictMetrics([
      kasus("ya", "ya"),
      kasus("tidak", "tidak"),
      kasus("tidak", "ya"),
      kasus("ya", "tidak"),
    ]);

    assert.equal(m.tp, 1);
    assert.equal(m.tn, 1);
    assert.equal(m.fp, 1, "GT tidak, model ya");
    assert.equal(m.fn, 1, "GT ya, model tidak");
    assert.equal(m.accuracy, 0.5);
    assert.equal(m.precision, 0.5);
    assert.equal(m.recall, 0.5);
    assert.equal(m.specificity, 0.5);
  });

  it("putusan null dilewati, tidak dihitung benar maupun salah", () => {
    const m = computeVerdictMetrics([kasus("ya", "ya"), kasus("ya", null), kasus("ya", null)]);

    assert.equal(m.total, 3);
    assert.equal(m.scored, 1);
    assert.equal(m.skipped, 2);
    assert.equal(m.accuracy, 1, "hanya kasus yang dinilai yang masuk penyebut");
  });

  it("ground truth satu kelas: spesifisitas tidak terdefinisi dan baseline 1,0", () => {
    const m = computeVerdictMetrics([
      kasus("ya", "ya"),
      kasus("ya", "ya"),
      kasus("ya", "tidak"),
    ]);

    assert.equal(m.specificity, null, "tak ada kasus berlabel tidak -> TN+FP = 0");
    assert.equal(m.majorityBaselineAccuracy, 1, "selalu menjawab 'ya' akan benar 3 dari 3");
    assert.equal(m.majorityClass, "ya");
    assert.ok(
      m.accuracy !== null && m.accuracy < m.majorityBaselineAccuracy,
      "model kalah dari penebak kelas mayoritas"
    );
    // Kappa TERDEFINISI di sini dan bernilai tepat 0. Kesepakatan harapan
    // bukan 1 melainkan 2/3, sebab model memakai dua kelas walau ground truth
    // hanya satu. Nilai 0 berarti kesepakatan model tidak melampaui kebetulan -
    // tafsir yang benar, dan justru lebih informatif daripada accuracy 0,67.
    assert.equal(m.kappa, 0);
  });

  it("GT dan model sama-sama satu kelas: kappa tidak terdefinisi", () => {
    const m = computeVerdictMetrics([kasus("ya", "ya"), kasus("ya", "ya")]);
    assert.equal(m.accuracy, 1, "akurasi sempurna");
    assert.equal(
      m.kappa,
      null,
      "tetapi kappa tidak terdefinisi - kesepakatan harapan 1, penyebut nol"
    );
    assert.equal(m.majorityBaselineAccuracy, 1, "penebak kelas mayoritas sama baiknya");
  });

  it("kelas seimbang: majorityClass null", () => {
    const m = computeVerdictMetrics([kasus("ya", "ya"), kasus("tidak", "tidak")]);
    assert.equal(m.majorityClass, null);
    assert.equal(m.majorityBaselineAccuracy, 0.5);
  });

  it("tanpa kasus sama sekali", () => {
    const m = computeVerdictMetrics([]);
    assert.equal(m.scored, 0);
    assert.equal(m.accuracy, null);
    assert.equal(m.majorityBaselineAccuracy, null);
    assert.equal(m.specificity, null);
  });
});

describe("computeCohenKappa", () => {
  it("kesepakatan sempurna pada dua kelas", () => {
    const a: Verdict[] = ["ya", "tidak", "ya", "tidak"];
    const hasil = computeCohenKappa(a, a);
    assert.equal(hasil.observedAgreement, 1);
    assert.equal(hasil.kappa, 1);
    assert.equal(hasil.overlap, 4);
  });

  it("ketidaksepakatan sempurna menghasilkan kappa negatif", () => {
    const a: Verdict[] = ["ya", "tidak", "ya", "tidak"];
    const b: Verdict[] = ["tidak", "ya", "tidak", "ya"];
    const hasil = computeCohenKappa(a, b);
    assert.equal(hasil.observedAgreement, 0);
    assert.ok(hasil.kappa !== null && hasil.kappa < 0);
  });

  it("kedua penilai memakai satu kelas: kappa tidak terdefinisi, bukan 1", () => {
    const a: Verdict[] = ["ya", "ya", "ya"];
    const hasil = computeCohenKappa(a, a);
    assert.equal(hasil.observedAgreement, 1, "mereka memang sepakat");
    assert.equal(hasil.expectedAgreement, 1, "tetapi kesepakatan itu sepenuhnya kebetulan");
    assert.equal(hasil.kappa, null, "penyebut nol -> harus null, bukan angka palsu");
  });

  it("hanya kasus yang dinilai KEDUA pihak yang masuk hitungan", () => {
    const a: (Verdict | null)[] = ["ya", "tidak", null, "ya"];
    const b: (Verdict | null)[] = ["ya", "tidak", "ya", null];
    const hasil = computeCohenKappa(a, b);
    assert.equal(hasil.overlap, 2, "dua kasus dinilai keduanya");
    assert.equal(hasil.observedAgreement, 1);
  });

  it("panjang larik berbeda dipotong ke yang terpendek", () => {
    const hasil = computeCohenKappa(["ya", "tidak", "ya"], ["ya", "tidak"]);
    assert.equal(hasil.overlap, 2);
  });

  it("tanpa irisan sama sekali", () => {
    const hasil = computeCohenKappa([], []);
    assert.equal(hasil.overlap, 0);
    assert.equal(hasil.kappa, null);
    assert.equal(hasil.observedAgreement, null);
  });
});
