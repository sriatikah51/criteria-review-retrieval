import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRetrievalMetrics, computeVerdictMetrics } from "../src/metrics/index.js";

describe("Metrics Module", () => {
  it("harus menghitung metrik IR (Precision, Recall, R-Precision, Normalized Recall, F1, Hit) dengan benar", () => {
    // 5 retrieved, 2 ground truth: "c1" dan "c3"
    // retrieved: ["c1", "c2", "c3", "c4", "c5"]
    const retrieved = ["c1", "c2", "c3", "c4", "c5"];
    const groundTruth = ["c1", "c3"];

    const metrics = computeRetrievalMetrics(retrieved, groundTruth);

    // Precision = 2 / 5 = 0.4
    assert.equal(metrics.precision, 0.4);
    // Recall = 2 / 2 = 1.0
    assert.equal(metrics.recall, 1.0);
    // Hit = 1
    assert.equal(metrics.hit, 1);
    // R = min(5, 2) = 2.
    // Normalized Recall = 2 / 2 = 1.0
    assert.equal(metrics.recallNormalized, 1.0);
    // Top-R = ["c1", "c2"]. Matches = 1 ("c1").
    // R-Precision = 1 / 2 = 0.5
    assert.equal(metrics.precisionAtR, 0.5);
  });

  it("harus menangani kasus no-evidence ground truth dengan benar", () => {
    const retrieved = ["c1", "c2"];
    const groundTruth: string[] = [];

    // Tak ada bukti yang seharusnya ditemukan, jadi tak ada yang dapat diukur:
    // seluruh metrik null, termasuk precision. Kasus semacam ini harus keluar
    // dari penyebut rata-rata, bukan menyumbang 0.
    const metrics = computeRetrievalMetrics(retrieved, groundTruth);
    assert.equal(metrics.precision, null);
    assert.equal(metrics.recall, null);
    assert.equal(metrics.f1, null);
    assert.equal(metrics.hit, null);
    assert.equal(metrics.recallNormalized, null);
    assert.equal(metrics.precisionAtR, null);
  });

  it("harus menghitung Confusion Matrix verdict (TP, FP, TN, FN) dan Accuracy/Precision/Recall/F1", () => {
    const cases = [
      { correctVerdict: "ya" as const, llmVerdict: "ya" as const }, // TP
      { correctVerdict: "ya" as const, llmVerdict: "ya" as const }, // TP
      { correctVerdict: "tidak" as const, llmVerdict: "tidak" as const }, // TN
      { correctVerdict: "tidak" as const, llmVerdict: "ya" as const }, // FP
      { correctVerdict: "ya" as const, llmVerdict: "tidak" as const }, // FN
      { correctVerdict: "ya" as const, llmVerdict: null }, // Skipped
    ];

    const res = computeVerdictMetrics(cases);

    assert.equal(res.total, 6);
    assert.equal(res.scored, 5);
    assert.equal(res.skipped, 1);
    assert.equal(res.tp, 2);
    assert.equal(res.tn, 1);
    assert.equal(res.fp, 1);
    assert.equal(res.fn, 1);

    // Accuracy = (2 + 1) / 5 = 3 / 5 = 0.6
    assert.equal(res.accuracy, 0.6);
    // Precision = 2 / (2 + 1) = 2/3 ≈ 0.667
    assert.ok(Math.abs(res.precision! - 2 / 3) < 0.001);
    // Recall = 2 / (2 + 1) = 2/3 ≈ 0.667
    assert.ok(Math.abs(res.recall! - 2 / 3) < 0.001);
  });
});
