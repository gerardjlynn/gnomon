/**
 * Meaning search — local semantic search over a vault.
 *
 * Everything runs on this machine: embeddings come from a small model
 * loaded in-process via transformers.js (ONNX), and the index is a plain
 * JSON file at `<vault>/.gnomon/index.json`. Nothing is sent anywhere.
 *
 * The index is chunked by heading so a hit points at a spot, not a whole
 * file, and carries the "side" (page / talk / rough) so a result can be
 * shown with its standing. Refresh is incremental: only files whose mtime
 * changed since the last index get re-embedded.
 *
 * This sits beside `searchVault` (grep): grep matches words, this matches
 * meaning. The gnome picks whichever fits the question.
 */
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { Vault } from "./vault.js";

const MODEL = "Xenova/all-MiniLM-L6-v2"; // 384-dim, small, no query prefix needed
const MAX_CHARS = 2000; // per chunk, before the model truncates anyway

export type Side = "page" | "talk" | "rough";

interface Chunk {
  path: string; // vault-relative
  side: Side;
  slug: string;
  heading: string;
  mtime: number;
  text: string;
  vector: number[];
}

interface Index {
  model: string;
  dim: number;
  files: Record<string, number>; // relpath -> mtimeMs, for incremental refresh
  chunks: Chunk[];
}

export interface Hit {
  vault?: string;
  slug: string;
  side: Side;
  heading: string;
  path: string;
  mtime: number;
  score: number;
  snippet: string;
}

// ── embedder (lazy singleton) ─────────────────────────────────────────
let embedderPromise: Promise<(texts: string[]) => Promise<number[][]>> | null =
  null;

async function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      // Imported lazily so the server starts even if the dep is absent;
      // only meaning_search fails, with a clear error. @xenova/transformers
      // (classic v2) bundles an onnxruntime-node with the darwin-x64 native
      // binary, which the newer @huggingface/transformers dropped — so it
      // loads under x64 Node on Apple Silicon (Rosetta), where the new one
      // can't. Fully local; no network except the one-time model download.
      const { pipeline } = await import("@xenova/transformers");
      const extractor = await pipeline("feature-extraction", MODEL);
      return async (texts: string[]) => {
        const out = await extractor(texts, {
          pooling: "mean",
          normalize: true,
        });
        return out.tolist() as number[][];
      };
    })();
  }
  return embedderPromise;
}

// ── chunking ──────────────────────────────────────────────────────────
/** Split a markdown body into (heading, text) chunks on H2 boundaries. */
function chunkMarkdown(
  body: string,
  title: string,
): Array<{ heading: string; text: string }> {
  const chunks: Array<{ heading: string; text: string }> = [];
  let heading = title;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) chunks.push({ heading, text });
    lines = [];
  };
  for (const line of body.split("\n")) {
    const m = line.match(/^##\s+(.+)/);
    if (m) {
      flush();
      heading = m[1].trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return chunks;
}

/** The text actually embedded: title + heading give the chunk context. */
function embedText(title: string, heading: string, text: string): string {
  const head = heading && heading !== title ? `${title} — ${heading}` : title;
  return `${head}\n${text}`.slice(0, MAX_CHARS);
}

// ── enumerate the indexable files ─────────────────────────────────────
async function targetFiles(
  vaultPath: string,
): Promise<Array<{ rel: string; side: Side }>> {
  const out: Array<{ rel: string; side: Side }> = [];
  const dirs: Array<{ dir: string; side: Side }> = [
    { dir: "articles", side: "page" },
    { dir: "talk", side: "talk" },
    { dir: "sources", side: "rough" },
  ];
  for (const { dir, side } of dirs) {
    const abs = join(vaultPath, dir);
    if (!existsSync(abs)) continue;
    for (const f of await readdir(abs)) {
      if (f.endsWith(".md")) out.push({ rel: `${dir}/${f}`, side });
    }
  }
  return out;
}

function slugOf(rel: string): string {
  return rel.replace(/^[^/]+\//, "").replace(/\.md$/, "");
}

// ── build / refresh the index ─────────────────────────────────────────
export async function refreshIndex(vaultPath: string): Promise<Index> {
  const indexDir = join(vaultPath, ".gnomon");
  const indexPath = join(indexDir, "index.json");

  let prev: Index | null = null;
  if (existsSync(indexPath)) {
    try {
      const parsed = JSON.parse(await readFile(indexPath, "utf-8")) as Index;
      if (parsed.model === MODEL) prev = parsed;
    } catch {
      prev = null; // corrupt index — rebuild
    }
  }

  const files = await targetFiles(vaultPath);
  const fileSet = new Set(files.map((f) => f.rel));
  const newFiles: Record<string, number> = {};
  const keptChunks: Chunk[] = [];
  const toEmbed: Array<{
    rel: string;
    side: Side;
    slug: string;
    heading: string;
    mtime: number;
    text: string;
    embed: string;
  }> = [];

  for (const { rel, side } of files) {
    const abs = join(vaultPath, rel);
    const mtime = (await stat(abs)).mtimeMs;
    newFiles[rel] = mtime;

    const unchanged = prev && prev.files[rel] === mtime;
    if (unchanged) {
      keptChunks.push(...prev!.chunks.filter((c) => c.path === rel));
      continue;
    }

    const raw = await readFile(abs, "utf-8");
    const { data, content } = matter(raw);
    const title =
      (data && typeof data.title === "string" && data.title) || slugOf(rel);
    for (const { heading, text } of chunkMarkdown(content, title)) {
      toEmbed.push({
        rel,
        side,
        slug: slugOf(rel),
        heading,
        mtime,
        text,
        embed: embedText(title, heading, text),
      });
    }
  }

  let dim = prev?.dim ?? 384;
  const freshChunks: Chunk[] = [];
  if (toEmbed.length > 0) {
    const embed = await getEmbedder();
    // batch to keep memory sane on large vaults
    const BATCH = 32;
    for (let i = 0; i < toEmbed.length; i += BATCH) {
      const batch = toEmbed.slice(i, i + BATCH);
      const vecs = await embed(batch.map((b) => b.embed));
      for (let j = 0; j < batch.length; j++) {
        const b = batch[j];
        dim = vecs[j].length;
        freshChunks.push({
          path: b.rel,
          side: b.side,
          slug: b.slug,
          heading: b.heading,
          mtime: b.mtime,
          text: b.text,
          vector: vecs[j],
        });
      }
    }
  }

  // drop chunks whose file no longer exists
  const chunks = [...keptChunks, ...freshChunks].filter((c) =>
    fileSet.has(c.path),
  );

  const index: Index = { model: MODEL, dim, files: newFiles, chunks };
  if (!existsSync(indexDir)) await mkdir(indexDir, { recursive: true });
  await writeFile(indexPath, JSON.stringify(index), "utf-8");
  return index;
}

// ── search ────────────────────────────────────────────────────────────
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vectors are normalized, so dot == cosine
}

function snippetOf(text: string, n = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n) + "…" : clean;
}

/** Refresh the vault's index, then return the top `limit` chunks for `query`. */
export async function searchVaultSemantic(
  vaultPath: string,
  query: string,
  limit: number,
): Promise<Hit[]> {
  const index = await refreshIndex(vaultPath);
  if (index.chunks.length === 0) return [];
  const embed = await getEmbedder();
  const [qvec] = await embed([query]);
  const scored = index.chunks.map((c) => ({
    c,
    score: dot(qvec, c.vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ c, score }) => ({
    slug: c.slug,
    side: c.side,
    heading: c.heading,
    path: c.path,
    mtime: c.mtime,
    score,
    snippet: snippetOf(c.text),
  }));
}
