/**
 * Vault operations — the file-system substrate gnomon operates on.
 *
 * Used by both the MCP server (mcp/server.ts) and the static site
 * generator (site/build.ts). The vault is a directory containing
 * articles/, talk/, sources/, and AGENTS.md, following the conventions
 * defined in AGENTS.md.
 */

import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import matter from "gray-matter";
import { GitOps } from "./git.js";

export interface ArticleFrontmatter {
  title: string;
  type: "concept" | "context" | "practice" | "source";
  status: "current" | "draft" | "stub" | "deprecated";
  created: string;
  updated: string;
  sources?: string[];
  related?: string[];
}

export interface Article {
  slug: string;
  frontmatter: ArticleFrontmatter;
  body: string;
  raw: string;
}

export interface TalkPage {
  slug: string;
  body: string;
}

export interface SourceFrontmatter {
  slug: string;
  url?: string;
  retrieved?: string;
  kind?: "gist" | "paper" | "book" | "transcript" | "webpage" | "other";
}

export interface Source {
  slug: string;
  frontmatter: SourceFrontmatter;
  body: string;
}

export class Vault {
  constructor(public readonly path: string) {}

  /**
   * Ensure the standard directories exist, and that talk pages are set to
   * union-merge (append-only logs concatenate on overlap instead of
   * conflicting — the mechanism that lets multiple authors sync without a
   * human refereeing every talk collision). Safe to call repeatedly.
   */
  async ensureLayout(): Promise<void> {
    for (const dir of ["articles", "talk", "sources"]) {
      const full = join(this.path, dir);
      if (!existsSync(full)) {
        await mkdir(full, { recursive: true });
      }
    }
    const attrs = join(this.path, ".gitattributes");
    const talkUnion = "talk/*.md merge=union";
    if (!existsSync(attrs)) {
      await writeFile(attrs, `${talkUnion}\n`, "utf-8");
    } else {
      const cur = await readFile(attrs, "utf-8");
      if (!cur.includes(talkUnion)) {
        await writeFile(attrs, `${cur.replace(/\n?$/, "\n")}${talkUnion}\n`, "utf-8");
      }
    }
  }

  /** List article slugs (filenames without .md). */
  async listArticleSlugs(): Promise<string[]> {
    const dir = join(this.path, "articles");
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir);
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
  }

  async readArticle(slug: string): Promise<Article> {
    const path = join(this.path, "articles", `${slug}.md`);
    const raw = await readFile(path, "utf-8");
    const parsed = matter(raw);
    const fm = normalizeFrontmatterDates(parsed.data);
    return {
      slug,
      frontmatter: fm as unknown as ArticleFrontmatter,
      body: parsed.content,
      raw,
    };
  }

  /**
   * Write an article. Updates the `updated` frontmatter field to today's
   * date unless `options.keepUpdated` is true (for janitorial normalization
   * that doesn't change content meaning). Ensures the article/talk pairing.
   */
  async writeArticle(
    slug: string,
    frontmatter: ArticleFrontmatter,
    body: string,
    options?: { keepUpdated?: boolean },
  ): Promise<void> {
    const fm = options?.keepUpdated
      ? frontmatter
      : { ...frontmatter, updated: new Date().toISOString().slice(0, 10) };
    const out = matter.stringify(body, fm);
    const path = join(this.path, "articles", `${slug}.md`);
    await writeFile(path, out, "utf-8");
    // Maintain article/talk pairing.
    await this.ensureTalkPage(slug, frontmatter.title);
  }

  async articleExists(slug: string): Promise<boolean> {
    return existsSync(join(this.path, "articles", `${slug}.md`));
  }

  async listTalkSlugs(): Promise<string[]> {
    const dir = join(this.path, "talk");
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir);
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
  }

  async readTalk(slug: string): Promise<TalkPage> {
    const path = join(this.path, "talk", `${slug}.md`);
    if (!existsSync(path)) {
      return { slug, body: "" };
    }
    const body = await readFile(path, "utf-8");
    return { slug, body };
  }

  async talkExists(slug: string): Promise<boolean> {
    return existsSync(join(this.path, "talk", `${slug}.md`));
  }

  /**
   * Append a new entry to a talk page under a given heading. If the
   * heading does not exist, it is created. The entry is appended to the
   * end of the section, never inserted in the middle.
   *
   * Talk pages are append-only in practice (AGENTS.md §5). This method
   * enforces that for the gnome — there is no edit-talk operation.
   */
  async postToTalk(
    slug: string,
    heading: string,
    entry: string,
  ): Promise<void> {
    const talkDir = join(this.path, "talk");
    if (!existsSync(talkDir)) await mkdir(talkDir, { recursive: true });
    const path = join(talkDir, `${slug}.md`);
    let body = "";
    if (existsSync(path)) {
      body = await readFile(path, "utf-8");
    } else {
      // First post creates the file with a header.
      const article = (await this.articleExists(slug))
        ? (await this.readArticle(slug)).frontmatter.title
        : slug;
      body = `# Talk: ${article}\n\n`;
    }

    const headingMarker = `## ${heading}`;
    if (body.includes(headingMarker)) {
      // Append to existing section (at the very end of the file is fine —
      // append-only convention means new entries on existing topics still
      // go at the bottom, not embedded in the middle of older threads).
      body = body.trimEnd() + "\n\n" + entry.trimEnd() + "\n";
    } else {
      // Create new section at the end.
      body =
        body.trimEnd() + "\n\n---\n\n" + headingMarker + "\n\n" + entry.trimEnd() + "\n";
    }

    await writeFile(path, body, "utf-8");
  }

  async ensureTalkPage(slug: string, title: string): Promise<void> {
    const talkDir = join(this.path, "talk");
    if (!existsSync(talkDir)) await mkdir(talkDir, { recursive: true });
    const path = join(talkDir, `${slug}.md`);
    if (!existsSync(path)) {
      await writeFile(path, `# Talk: ${title}\n\n*(empty)*\n`, "utf-8");
    }
  }

  async listSourceSlugs(): Promise<string[]> {
    const dir = join(this.path, "sources");
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir);
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
  }

  async readSource(slug: string): Promise<Source> {
    const path = join(this.path, "sources", `${slug}.md`);
    const raw = await readFile(path, "utf-8");
    const parsed = matter(raw);
    const fm = normalizeFrontmatterDates(parsed.data);
    return {
      slug,
      frontmatter: fm as unknown as SourceFrontmatter,
      body: parsed.content,
    };
  }

  async sourceExists(slug: string): Promise<boolean> {
    return existsSync(join(this.path, "sources", `${slug}.md`));
  }

  /**
   * Substring search across the vault. Case-insensitive; scope selects
   * which directories are included (default all). Returns up to `limit`
   * matches with file path, line number, and the matching line trimmed.
   *
   * This is a local-vault grep — not the vetoed `query`/RAG/semantic
   * search affordance. The gnome calls it the same way it would shell
   * out to grep, but with a stable result shape.
   */
  async searchVault(opts: {
    query: string;
    scope?: "all" | "articles" | "talk" | "sources" | "root";
    limit?: number;
  }): Promise<Array<{ file: string; line: number; context: string }>> {
    const limit = opts.limit ?? 50;
    const scope = opts.scope ?? "all";
    const q = opts.query.toLowerCase();
    if (q.length === 0) return [];
    const files: string[] = [];
    if (scope === "all" || scope === "articles") {
      const slugs = await this.listArticleSlugs();
      files.push(...slugs.map((s) => `articles/${s}.md`));
    }
    if (scope === "all" || scope === "talk") {
      const slugs = await this.listTalkSlugs();
      files.push(...slugs.map((s) => `talk/${s}.md`));
    }
    if (scope === "all" || scope === "sources") {
      const slugs = await this.listSourceSlugs();
      files.push(...slugs.map((s) => `sources/${s}.md`));
    }
    if (scope === "all" || scope === "root") {
      // Vault-root .md files, excluding HANDOFF.md (operational, not
      // part of the vault's published surface).
      const entries = await readdir(this.path);
      for (const f of entries) {
        if (f.endsWith(".md") && f !== "HANDOFF.md") {
          files.push(f);
        }
      }
    }
    const results: Array<{ file: string; line: number; context: string }> = [];
    for (const file of files) {
      if (results.length >= limit) break;
      const content = await readFile(join(this.path, file), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= limit) break;
        if (lines[i].toLowerCase().includes(q)) {
          results.push({ file, line: i + 1, context: lines[i].trim() });
        }
      }
    }
    return results;
  }

  /**
   * Create a new source stub. Used by `ingest_source`. The body is
   * usually the source's text content (or a pointer if the source is
   * too large to inline). The article *about* the source goes in
   * articles/ separately as type: source.
   */
  async writeSource(
    slug: string,
    frontmatter: SourceFrontmatter,
    body: string,
  ): Promise<void> {
    const sourcesDir = join(this.path, "sources");
    if (!existsSync(sourcesDir)) await mkdir(sourcesDir, { recursive: true });
    // Drop undefined-valued keys: optional fields (url, kind) arrive as
    // undefined when omitted, and js-yaml throws on undefined rather than
    // skipping it. Object key order is preserved for the surviving keys.
    const clean = Object.fromEntries(
      Object.entries(frontmatter).filter(([, v]) => v !== undefined),
    );
    const out = matter.stringify(body, clean);
    const path = join(sourcesDir, `${slug}.md`);
    await writeFile(path, out, "utf-8");
  }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Return a copy of `frontmatter` with its keys in the canonical order
 * (title, type, status, created, updated, sources, related). `matter.stringify`
 * serializes keys in insertion order, so building the object in this order is
 * what fixes the on-disk field order. Optional fields are emitted only when
 * present. Single source of truth for field order — used by both
 * `normalize_frontmatter` and `create_article`.
 */
export function canonicalFrontmatterOrder(
  frontmatter: ArticleFrontmatter,
): ArticleFrontmatter {
  const canonical: Record<string, unknown> = {
    title: frontmatter.title,
    type: frontmatter.type,
    status: frontmatter.status,
    created: frontmatter.created,
    updated: frontmatter.updated,
  };
  if (frontmatter.sources) canonical.sources = frontmatter.sources;
  if (frontmatter.related) canonical.related = frontmatter.related;
  return canonical as unknown as ArticleFrontmatter;
}

/**
 * Convert an H2 thread heading into the slug used in `[talk:slug#thread]`
 * anchor references. Lowercase, non-alphanumerics → hyphens, collapse
 * runs, trim hyphens, drop a leading `on-`.
 */
export function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^on-/, "");
}

/**
 * YAML parses `2026-04-23` as a Date object. Coerce date-shaped values
 * back to ISO date strings (YYYY-MM-DD) so the rest of the codebase
 * can treat frontmatter dates as plain strings.
 */
function normalizeFrontmatterDates(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const key of ["created", "updated", "retrieved"]) {
    const v = out[key];
    if (v instanceof Date) {
      out[key] = v.toISOString().slice(0, 10);
    }
  }
  return out;
}

/**
 * A registry of named vaults the MCP server is currently serving.
 *
 * Each entry pairs a Vault (file-system substrate) with its GitOps
 * (commit/push/PR handle for that vault's repo). Tools resolve the
 * pair by name; `resolve(undefined)` returns the default vault (the
 * first one registered).
 *
 * Construction is caller-driven — the server parses `--vault` flags
 * and registers each pair. The registry itself does not know about
 * flags or filesystem layout.
 */
export interface VaultEntry {
  readonly vault: Vault;
  readonly git: GitOps;
}

export class VaultRegistry {
  private readonly entries = new Map<string, VaultEntry>();
  private defaultName: string | null = null;

  /** Register a vault under `name`. The first one registered becomes default. */
  register(name: string, vault: Vault, git: GitOps): void {
    if (this.entries.has(name)) {
      throw new Error(`Vault name '${name}' already registered`);
    }
    this.entries.set(name, { vault, git });
    if (this.defaultName === null) {
      this.defaultName = name;
    }
  }

  /**
   * Look up an entry by name, or return the default entry if `name` is
   * undefined. Throws if `name` is provided but not registered, or if
   * the registry is empty.
   */
  resolve(name: string | undefined): VaultEntry {
    if (name !== undefined) {
      const entry = this.entries.get(name);
      if (!entry) {
        throw new Error(
          `Unknown vault '${name}'. Registered: ${this.list().join(", ") || "(none)"}`,
        );
      }
      return entry;
    }
    if (this.defaultName === null) {
      throw new Error("No vaults registered");
    }
    return this.entries.get(this.defaultName)!;
  }

  /** Names of all registered vaults, in registration order. */
  list(): string[] {
    return Array.from(this.entries.keys());
  }

  /** True when at least one vault is registered. */
  hasAny(): boolean {
    return this.entries.size > 0;
  }
}
