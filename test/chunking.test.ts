import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPageMarkerIndex,
  pageAtOffset,
  splitIntoSentences,
  splitIntoSentenceChunks,
  splitIntoStructureChunks,
  buildLabeledChunks,
} from "../src/chunking/index.js";

describe("Chunking Module", () => {
  it("harus mengekstrak indeks penanda halaman [Halaman N] dengan benar", () => {
    const text = "[Halaman 1]\n\nJudul Laporan\n\n[Halaman 2]\n\nBAB I PENDAHULUAN\n\n[Halaman 3]\n\nIsi Bab";
    const markers = buildPageMarkerIndex(text);

    assert.equal(markers.length, 3);
    assert.equal(markers[0].page, 1);
    assert.equal(markers[1].page, 2);
    assert.equal(markers[2].page, 3);

    // Cari halaman berdasarkan offset
    assert.equal(pageAtOffset(markers, 5), 1);
    assert.equal(pageAtOffset(markers, markers[1].offset + 10), 2);
    assert.equal(pageAtOffset(markers, markers[2].offset + 5), 3);
  });

  it("harus memecah kalimat dengan benar dan mengenali singkatan birokrasi Indonesia", () => {
    const text =
      "Dinas Kab. Contoh melakukan kegiatan s.d. akhir tahun. Jumlah anggaran sebesar Rp. 1.000.000,- telah disalurkan a.n. Kepala Dinas. Hal ini penting!";
    const sentences = splitIntoSentences(text);

    // Memastikan singkatan "s.d.", "Rp.", "a.n.", "1.000.000" tidak memotong kalimat di tengah
    assert.ok(sentences.length >= 2);
    assert.ok(sentences[0].content.includes("s.d."));
    assert.ok(sentences[1].content.includes("Rp. 1.000.000"));
  });

  it("harus memecah berdasarkan BAB resmi (splitIntoStructureChunks)", () => {
    const text = `BAB I PENDAHULUAN
Latar belakang penyusunan LAKIN.

BAB II PERENCANAAN KINERJA
Rencana strategis dan target kinerja.

BAB III AKUNTABILITAS KINERJA
Capaian kinerja dan evaluasi indikator.`;

    const chunks = splitIntoStructureChunks(text, 3500, 1);
    assert.equal(chunks.length, 3);
    assert.ok(chunks[0].content.includes("BAB I PENDAHULUAN"));
    assert.ok(chunks[1].content.includes("BAB II PERENCANAAN KINERJA"));
    assert.ok(chunks[2].content.includes("BAB III AKUNTABILITAS KINERJA"));
  });

  it("harus menghasilkan LabeledChunks lengkap dengan penanda halaman fisik", () => {
    const text = `[Halaman 1]
BAB I PENDAHULUAN
Ini adalah pendahuluan laporan kinerja instansi yang cukup panjang.

[Halaman 2]
BAB II PERENCANAAN
Ini adalah bab kedua laporan kinerja instansi yang memuat target.`;

    const labeled = buildLabeledChunks(text, {
      chunkSize: 3500,
      overlapSentences: 1,
      chunkingMethod: "structure",
    });

    assert.equal(labeled.length, 2);
    assert.equal(labeled[0].chunkIndex, 0);
    assert.equal(labeled[0].page, 1);
    assert.equal(labeled[1].chunkIndex, 1);
    assert.equal(labeled[1].page, 2);
  });
});
