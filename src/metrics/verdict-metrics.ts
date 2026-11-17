import type { AgreementMetrics, Verdict, VerdictMetrics } from "../types/index.js";

/**
 * Cohen's kappa untuk dua rangkaian label biner yang sejajar posisinya.
 * Dipakai untuk dua hal: kesepakatan antar dua anotator manusia, dan
 * kesepakatan model terhadap label akhir.
 *
 * Mengembalikan kappa = null bila tidak terdefinisi, yaitu ketika kesepakatan
 * harapan bernilai 1 - terjadi saat kedua pihak hanya memakai satu kelas.
 * Pada keadaan itu kappa bukan 0 dan bukan 1, melainkan tidak bermakna, dan
 * memaksanya menjadi angka akan menyesatkan.
 */
export function computeCohenKappa(
  labelsA: (Verdict | null)[],
  labelsB: (Verdict | null)[]
): AgreementMetrics {
  const pasangan: [Verdict, Verdict][] = [];
  const panjang = Math.min(labelsA.length, labelsB.length);
  for (let i = 0; i < panjang; i++) {
    const a = labelsA[i];
    const b = labelsB[i];
    if (a === null || a === undefined || b === null || b === undefined) continue;
    pasangan.push([a, b]);
  }

  const overlap = pasangan.length;
  if (overlap === 0) {
    return { overlap: 0, observedAgreement: null, expectedAgreement: null, kappa: null };
  }

  const sama = pasangan.filter(([a, b]) => a === b).length;
  const observedAgreement = sama / overlap;

  const aYa = pasangan.filter(([a]) => a === "ya").length / overlap;
  const bYa = pasangan.filter(([, b]) => b === "ya").length / overlap;
  const expectedAgreement = aYa * bYa + (1 - aYa) * (1 - bYa);

  // expectedAgreement === 1 berarti kedua penilai memakai satu kelas saja.
  const kappa =
    expectedAgreement < 1
      ? (observedAgreement - expectedAgreement) / (1 - expectedAgreement)
      : null;

  return { overlap, observedAgreement, expectedAgreement, kappa };
}

export interface VerdictComparisonCase {
  correctVerdict: Verdict;
  llmVerdict: Verdict | null;
}

/**
 * Menghitung metrik klasifikasi verdict (Confusion Matrix) dengan kelas positif = "ya".
 *
 * - TP: correct="ya", llm="ya"
 * - TN: correct="tidak", llm="tidak"
 * - FP: correct="tidak", llm="ya" (False Alarm)
 * - FN: correct="ya", llm="tidak" (Missed)
 */
export function computeVerdictMetrics(cases: VerdictComparisonCase[]): VerdictMetrics {
  let tp = 0;
  let tn = 0;
  let fp = 0;
  let fn = 0;
  let skipped = 0;

  for (const c of cases) {
    if (c.llmVerdict === null) {
      skipped++;
      continue;
    }

    const correct = c.correctVerdict.toLowerCase();
    const pred = c.llmVerdict.toLowerCase();

    if (correct === "ya" && pred === "ya") tp++;
    else if (correct === "tidak" && pred === "tidak") tn++;
    else if (correct === "tidak" && pred === "ya") fp++;
    else if (correct === "ya" && pred === "tidak") fn++;
  }

  const scored = tp + tn + fp + fn;
  const accuracy = scored > 0 ? (tp + tn) / scored : null;
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;

  // TN / (TN + FP). Tidak terdefinisi bila tak ada kasus berlabel "tidak".
  const specificity = tn + fp > 0 ? tn / (tn + fp) : null;

  // Pembanding kelas mayoritas, dihitung HANYA atas kasus yang ikut dinilai -
  // agar sebanding dengan accuracy di atas. Pada ground truth satu kelas,
  // baseline ini bernilai 1,0 dan menunjukkan bahwa accuracy model tidak
  // membuktikan apa pun.
  const dinilai = cases.filter((c) => c.llmVerdict !== null);
  const gtYa = dinilai.filter((c) => c.correctVerdict.toLowerCase() === "ya").length;
  const gtTidak = dinilai.length - gtYa;
  const majorityClass: Verdict | null =
    dinilai.length === 0 || gtYa === gtTidak ? null : gtYa > gtTidak ? "ya" : "tidak";
  const majorityBaselineAccuracy =
    dinilai.length > 0 ? Math.max(gtYa, gtTidak) / dinilai.length : null;

  const { kappa } = computeCohenKappa(
    dinilai.map((c) => c.correctVerdict.toLowerCase() as Verdict),
    dinilai.map((c) => (c.llmVerdict ? (c.llmVerdict.toLowerCase() as Verdict) : null))
  );

  return {
    total: cases.length,
    scored,
    skipped,
    tp,
    tn,
    fp,
    fn,
    accuracy,
    precision,
    recall,
    f1,
    specificity,
    majorityBaselineAccuracy,
    majorityClass,
    kappa,
  };
}
