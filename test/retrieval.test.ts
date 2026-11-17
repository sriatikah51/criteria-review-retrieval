import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCandidateWords,
  buildDistinctiveLexicalQuery,
  applyRRF,
  sortByDocumentOrder,
} from "../src/retrieval/index.js";
import type { ChunkRow } from "../src/types/index.js";

describe("Retrieval & RRF Module", () => {
  it("harus menyaring stopword bahasa Indonesia dan mengambil kata kunci bermakna", () => {
    const text = "Laporan kinerja yang telah disusun dan disampaikan secara tepat waktu guna evaluasi";
    const candidates = extractCandidateWords(text);

    assert.ok(!candidates.includes("yang"));
    assert.ok(!candidates.includes("telah"));
    assert.ok(!candidates.includes("dan"));
    assert.ok(!candidates.includes("secara"));
    assert.ok(!candidates.includes("guna"));

    assert.ok(candidates.includes("laporan"));
    assert.ok(candidates.includes("kinerja"));
    assert.ok(candidates.includes("disusun"));
    assert.ok(candidates.includes("evaluasi"));
  });

  it("harus memfilter kata yang terlalu umum menggunakan batas frekuensi dokumen (<= 10%)", async () => {
    const text = "Prioritas nasional presiden dalam kinerja tahun 2024";
    const totalChunks = 100;

    // Simulasi frekuensi kata: "kinerja" dan "tahun" sering muncul (>= 50 kali)
    // "prioritas" dan "presiden" jarang muncul (hanya 3-5 kali)
    const mockFreq = async (word: string) => {
      if (word === "kinerja") return 80;
      if (word === "tahun") return 90;
      if (word === "prioritas") return 4;
      if (word === "presiden") return 2;
      return 1;
    };

    const query = await buildDistinctiveLexicalQuery(text, totalChunks, mockFreq, {
      maxDocFrequencyRatio: 0.1,
    });

    assert.ok(query !== null);
    assert.ok(query.includes("prioritas"));
    assert.ok(query.includes("presiden"));
    assert.ok(!query.includes("kinerja")); // Terlalu umum (> 10%)
    assert.ok(!query.includes("tahun")); // Terlalu umum (> 10%)
  });

  it("harus menggabungkan ranking semantik dan leksikal dengan formula RRF k=60", () => {
    const semanticList: ChunkRow[] = [
      { id: "c1", chunkIndex: 1, content: "Chunk 1 content" },
      { id: "c2", chunkIndex: 2, content: "Chunk 2 content" },
      { id: "c3", chunkIndex: 3, content: "Chunk 3 content" },
    ];

    const lexicalList: ChunkRow[] = [
      { id: "c2", chunkIndex: 2, content: "Chunk 2 content" },
      { id: "c4", chunkIndex: 4, content: "Chunk 4 content" },
      { id: "c1", chunkIndex: 1, content: "Chunk 1 content" },
    ];

    const fused = applyRRF([semanticList, lexicalList], { rrfK: 60, finalTopK: 3 });

    // c2 ranked #2 di semantic dan #1 di lexical -> skor = 1/(60+2) + 1/(60+1)
    // c1 ranked #1 di semantic dan #3 di lexical -> skor = 1/(60+1) + 1/(60+3)
    // 1/62 + 1/61 vs 1/61 + 1/63 -> c2 lebih tinggi dari c1!
    assert.equal(fused.length, 3);
    assert.equal(fused[0].id, "c2");
    assert.equal(fused[1].id, "c1");
    assert.ok(fused[0].score! > fused[1].score!);
  });

  it("harus mengurutkan kembali chunk hasil RRF berdasarkan chunkIndex dokumen asli", () => {
    const fused: ChunkRow[] = [
      { id: "c5", chunkIndex: 5, content: "Bagian Akhir" },
      { id: "c1", chunkIndex: 1, content: "Bagian Awal" },
      { id: "c3", chunkIndex: 3, content: "Bagian Tengah" },
    ];

    const sorted = sortByDocumentOrder(fused);
    assert.equal(sorted[0].id, "c1");
    assert.equal(sorted[1].id, "c3");
    assert.equal(sorted[2].id, "c5");
  });
});
