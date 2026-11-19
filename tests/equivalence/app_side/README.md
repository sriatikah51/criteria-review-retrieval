# app_side — kesetaraan kode aplikasi vs library

`check_equivalence.ts` membandingkan kode retrieval sisi aplikasi (penyusun kueri leksikal `makeLexicalQueryBuilder` dan merger RRF `applyRRF` aplikasi) dengan `buildDistinctiveLexicalQuery` dan `applyRRF` dari library, pada 140 kasus × 13 nilai max_df.

Hasilnya ada di `REPORT.md`: kueri leksikal **1.820 dari 1.820** identik, fusi RRF **1.820 dari 1.820** identik, dan **350 dari 350** perbandingan terhadap daftar tersimpan identik, tanpa satu pun perbedaan.

Skrip ini disertakan sebagai rekaman, bukan untuk dijalankan. Ia mengimpor modul aplikasi (`@/lib/rag-retrieval`, `@/lib/db`, `@/lib/embeddings`, `@/lib/text-search-utils`) dan membutuhkan basis data korpus serta layanan embedding, yang semuanya tidak termasuk di repo ini.

Path, nomor baris, dan nama berkas keluaran yang dirujuk di `REPORT.md` mengacu pada repositori aplikasi. Berkas CSV dan log yang disebut di sana tidak disertakan.
