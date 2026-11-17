// CONTOH adapter — SALIN berkas ini menjadi `adapter.ts` lalu isi dengan
// implementasi Anda. `adapter.ts` tidak disertakan di repositori karena ia
// bergantung pada basis data dan layanan embedding Anda sendiri.
//
// TIDAK ADA bagian dari berkas ini yang merupakan kode library. Library tidak
// punya akses basis data; ia hanya mendefinisikan tipe handler. Kedua kueri SQL
// di bawah berasal dari APLIKASI yang memakai library, dan disertakan apa adanya
// agar hasil uji kesetaraan dapat ditelaah.
//
// Jangan menuliskan kredensial di berkas ini. Baca dari process.env.

/* eslint-disable @typescript-eslint/no-unused-vars */

export interface DbRow {
  id: string;
  chunk_index: number;
  content: string;
}

/**
 * Kueri SQL sembarang ke basis data korpus. Implementasi contoh memakai paket
 * `pg`; ganti sesuai basis data Anda.
 *
 * Contoh implementasi:
 *
 *   import { Pool } from "pg";
 *   const pool = new Pool({
 *     host: process.env.DB_HOST,
 *     port: Number(process.env.DB_PORT),
 *     database: process.env.DB_DATABASE,
 *     user: process.env.DB_USERNAME,
 *     password: process.env.DB_PASSWORD,
 *   });
 *   export const query = async <T>(sql: string, params: unknown[] = []) =>
 *     (await pool.query<T>(sql, params)).rows as T[];
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  throw new Error("adapter.query() belum diimplementasikan");
}

/** Menutup koneksi di akhir jalan. */
export async function closePool(): Promise<void> {
  throw new Error("adapter.closePool() belum diimplementasikan");
}

/**
 * Mengubah satu teks kueri menjadi vektor embedding.
 *
 * Catatan yang menentukan hasil: model embedding keluarga Gemma memakai prefiks
 * khusus. Pada eksperimen yang dilaporkan, teks kueri diberi prefiks
 * "task: search result | query: " dan teks passage diberi prefiks
 * "title: none | text: " SEBELUM dikirim ke model. Chunk di basis data sudah
 * di-embed dengan prefiks passage. Kalau prefiks kueri tidak Anda terapkan,
 * peringkat semantik akan berbeda.
 */
export async function embedQuery(text: string): Promise<number[]> {
  throw new Error("adapter.embedQuery() belum diimplementasikan");
}

/** Mengubah vektor menjadi literal teks pgvector, mis. "[0.1,0.2,…]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

// ---------------------------------------------------------------------------
// SQL yang dipakai pada eksperimen yang dilaporkan — BERASAL DARI APLIKASI,
// bukan dari library. Disalin apa adanya agar dapat direproduksi.
//
// Skema yang diasumsikan: tabel `document_chunks` dengan kolom
//   id uuid, document_id uuid, chunk_index int, content text,
//   embedding vector(768), content_tsv tsvector
// plus tabel `documents` (id, created_at) dan `criteria` (id, code,
// description, is_active).
// ---------------------------------------------------------------------------

/** Pencarian semantik: jarak kosinus pgvector, TANPA indeks (pencarian eksak). */
export const SQL_SEMANTIC = `
  select id, chunk_index, content
  from document_chunks
  where document_id = $1
  order by embedding <=> $2::vector
  limit $3`;

/** Pencarian leksikal: full-text PostgreSQL dengan konfigurasi 'simple'. */
export const SQL_LEXICAL = `
  select id, chunk_index, content
  from document_chunks
  where document_id = $1
    and content_tsv @@ to_tsquery('simple', $2)
  order by ts_rank_cd(content_tsv, to_tsquery('simple', $2)) desc
  limit $3`;

/** Document frequency satu kata di dalam satu dokumen. */
export const SQL_DOC_FREQUENCY = `
  select count(*)::int as n
  from document_chunks
  where document_id = $1 and content_tsv @@ to_tsquery('simple', $2)`;
