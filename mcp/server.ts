#!/usr/bin/env node
/**
 * Gnomon MCP server.
 *
 * Exposes the vault operations from AGENTS.md as MCP tools. Multi-vault:
 * one server can serve N vaults, registered via repeated `--vault name=path`
 * flags. Each tool takes an optional `vault` parameter selecting which
 * registered vault to operate on; omitted defaults to the first registered.
 *
 * Usage:
 *   gnomon-mcp --vault gnomon=/path/to/gnomon/vault
 *   gnomon-mcp --vault gnomon=... --vault notes=...
 *   gnomon-mcp --vault-path /path/to/vault           (legacy; registers as 'default')
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import {
  Vault,
  VaultRegistry,
  todayISO,
  canonicalFrontmatterOrder,
  type ArticleFrontmatter,
} from "./vault.js";
import { loadVaultConfig, CONFIG_PATH } from "./config.js";
import { lint, formatFindings } from "./lint.js";
import { GitOps, loadGnomeIdentity, type CommitResult } from "./git.js";
import { searchVaultSemantic, type Hit } from "./semantic.js";
import {
  compactTalk,
  sampleAgainstOriginal,
  navigateForHuman,
} from "./librarian.js";

function okMsg(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorMsg(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render a CommitResult into one human-facing status line, so every write
 * tool reports committed / pushed / held / conflicted the same way.
 */
function syncReport(r: CommitResult, label: string): string {
  const short = r.sha.slice(0, 7);
  if (r.conflict) {
    const files = r.conflict.files.length ? r.conflict.files.join(", ") : "a file";
    return `${label} committed locally as ${short}, but sync stopped: ${files} also changed on the remote and can't auto-merge. Reconcile by hand (pull, resolve, push) or revert ${short}.`;
  }
  if (!r.pushed) {
    if (r.pushError) {
      const first = r.pushError.trim().split("\n")[0];
      return `${label} committed as ${short}; not pushed (${first}). It's safe locally.`;
    }
    return `${label} committed as ${short} locally — held, not pushed. Push when ready.`;
  }
  return `${label} committed and pushed as ${short}${r.pulledChanges ? " (pulled in remote changes first)" : ""}.`;
}

/**
 * Shared `push` control for every write tool. Default is capture-and-sync;
 * `false` holds the change locally.
 */
const pushParam = z
  .boolean()
  .optional()
  .describe(
    "Sync to the shared remote. Default true — commit, pull-rebase, then push. Set false to hold the change locally (committed, not pushed) until you're ready.",
  );

interface VaultRegistration {
  name: string;
  path: string;
}

/**
 * Parse repeated `--vault name=path` flags. For backwards compat,
 * `--vault-path <path>` registers a single vault with name 'default'.
 * Both forms may be mixed and repeated. Returns flag registrations only;
 * the persistent registry lives in vaults.json (see resolveRegistrations).
 */
function parseFlagArgs(): VaultRegistration[] {
  const args = process.argv.slice(2);
  const registrations: VaultRegistration[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--vault-path") {
      const path = args[i + 1];
      if (!path) {
        console.error("--vault-path requires a path argument");
        process.exit(1);
      }
      registrations.push({ name: "default", path: resolve(path) });
      i++;
    } else if (a === "--vault") {
      const spec = args[i + 1];
      if (!spec) {
        console.error("--vault requires a 'name=path' argument");
        process.exit(1);
      }
      const eq = spec.indexOf("=");
      if (eq === -1) {
        console.error(`--vault expects 'name=path', got '${spec}'`);
        process.exit(1);
      }
      const name = spec.slice(0, eq);
      const path = spec.slice(eq + 1);
      if (!name || !path) {
        console.error(`--vault '${spec}' has empty name or path`);
        process.exit(1);
      }
      registrations.push({ name, path: resolve(path) });
      i++;
    }
  }
  return registrations;
}

/**
 * The vaults to serve: vaults.json entries first (their file order fixes the
 * default — the first entry), then `--vault` flags, which override an existing
 * name in place or append a new one. Exits if the result is empty.
 */
function resolveRegistrations(): VaultRegistration[] {
  const byName = new Map<string, string>();
  for (const { name, path } of loadVaultConfig()) byName.set(name, path);
  for (const { name, path } of parseFlagArgs()) byName.set(name, path);
  const registrations = Array.from(byName, ([name, path]) => ({ name, path }));
  if (registrations.length === 0) {
    console.error(
      `No vaults registered. Add entries to ${CONFIG_PATH} (or pass --vault name=path).`,
    );
    process.exit(1);
  }
  return registrations;
}

/**
 * Build the `vault` parameter schema for a tool. Description lists the
 * registered vault names so an LLM caller sees them without needing to
 * discover them. Optional — omission resolves to the default vault.
 */
function vaultParam(registry: VaultRegistry) {
  const list = registry.list();
  const desc =
    list.length === 1
      ? `Vault to operate on. Only one registered: '${list[0]}' (used by default). Parameter exists for forward-compat with multi-vault setups.`
      : `Vault to operate on. Registered: ${list.join(", ")}. Defaults to '${list[0]}'.`;
  return z.string().optional().describe(desc);
}

async function main() {
  const registrations = resolveRegistrations();
  const registry = new VaultRegistry();
  for (const { name, path } of registrations) {
    const v = new Vault(path);
    await v.ensureLayout();
    const identity = await loadGnomeIdentity(path);
    const git = new GitOps(path, identity);
    registry.register(name, v, git);
  }

  const server = new McpServer({
    name: "gnomon",
    version: "0.2.0",
  });

  // ---------------------------------------------------------------
  // list_articles
  // ---------------------------------------------------------------
  server.tool(
    "list_articles",
    "List all article slugs in the vault, with their type and status.",
    { vault: vaultParam(registry) },
    async ({ vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      const slugs = await vault.listArticleSlugs();
      const rows: string[] = [];
      for (const slug of slugs) {
        const article = await vault.readArticle(slug);
        rows.push(
          `${slug}\t${article.frontmatter.type}\t${article.frontmatter.status}\t${article.frontmatter.title}`,
        );
      }
      return {
        content: [
          {
            type: "text",
            text:
              rows.length === 0
                ? "(no articles)"
                : `slug\ttype\tstatus\ttitle\n${rows.join("\n")}`,
          },
        ],
      };
    },
  );

  // ---------------------------------------------------------------
  // read_article
  // ---------------------------------------------------------------
  server.tool(
    "read_article",
    "Read an article by slug. Returns full content including frontmatter.",
    { slug: z.string(), vault: vaultParam(registry) },
    async ({ slug, vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      if (!(await vault.articleExists(slug))) {
        return {
          content: [{ type: "text", text: `No article with slug '${slug}'.` }],
          isError: true,
        };
      }
      const article = await vault.readArticle(slug);
      return { content: [{ type: "text", text: article.raw }] };
    },
  );

  // ---------------------------------------------------------------
  // Janitorial tools (HANDOFF.md phase 2c)
  //
  // Structural edits the gnome makes freely per AGENTS.md §4 — no
  // talk-grounding required. Each commits with a `janitorial:` prefix
  // and pushes to main; the commit message is the audit scar.
  // ---------------------------------------------------------------

  server.tool(
    "fix_typo",
    "Janitorial: replace an exact-once string in an article body (e.g., a typo). Commits as 'janitorial: ...' and syncs to main by default. Rejected if the string appears zero or more-than-once — provide more surrounding context to disambiguate.",
    {
      slug: z.string(),
      search: z.string().describe("Exact string to replace. Must appear exactly once in the body."),
      replace: z.string().describe("Replacement string."),
      push: pushParam,
      vault: vaultParam(registry),
    },
    async ({ slug, search, replace, push, vault: vaultArg }) => {
      const { vault, git } = registry.resolve(vaultArg);
      if (!(await vault.articleExists(slug))) {
        return errorMsg(`No article with slug '${slug}'.`);
      }
      const article = await vault.readArticle(slug);
      const idx = article.body.indexOf(search);
      if (idx === -1) {
        return errorMsg(`String not found in articles/${slug}.md.`);
      }
      if (article.body.indexOf(search, idx + 1) !== -1) {
        return errorMsg(
          `String appears more than once in articles/${slug}.md. Provide more surrounding context to disambiguate.`,
        );
      }
      const newBody = article.body.slice(0, idx) + replace + article.body.slice(idx + search.length);
      await vault.writeArticle(slug, article.frontmatter, newBody);
      const result = await git.commitAndSync({
        message: `janitorial: fix typo in articles/${slug}.md`,
        files: [`articles/${slug}.md`],
        push,
      });
      return okMsg(syncReport(result, "Typo fix"));
    },
  );

  server.tool(
    "normalize_frontmatter",
    "Janitorial: canonicalize frontmatter field order in an article (title, type, status, created, updated, sources, related). Does not bump `updated` — purely structural. Commits and syncs only if anything actually changed.",
    {
      slug: z.string(),
      push: pushParam,
      vault: vaultParam(registry),
    },
    async ({ slug, push, vault: vaultArg }) => {
      const { vault, git } = registry.resolve(vaultArg);
      if (!(await vault.articleExists(slug))) {
        return errorMsg(`No article with slug '${slug}'.`);
      }
      const before = await vault.readArticle(slug);
      const canonical = canonicalFrontmatterOrder(before.frontmatter);
      await vault.writeArticle(slug, canonical, before.body, {
        keepUpdated: true,
      });
      const after = await vault.readArticle(slug);
      if (after.raw === before.raw) {
        return okMsg(`No changes — frontmatter already canonical.`);
      }
      const result = await git.commitAndSync({
        message: `janitorial: normalize frontmatter in articles/${slug}.md`,
        files: [`articles/${slug}.md`],
        push,
      });
      return okMsg(syncReport(result, "Frontmatter normalize"));
    },
  );

  server.tool(
    "fix_broken_link",
    "Janitorial: rewrite `[old_target]` slug references to `[new_target]` in an article body (e.g., when an article is renamed or a link was broken). Commits as 'janitorial: ...' and syncs.",
    {
      slug: z.string(),
      old_target: z.string().describe("Slug currently referenced in the article body."),
      new_target: z.string().describe("Slug to replace it with."),
      push: pushParam,
      vault: vaultParam(registry),
    },
    async ({ slug, old_target, new_target, push, vault: vaultArg }) => {
      const { vault, git } = registry.resolve(vaultArg);
      if (!(await vault.articleExists(slug))) {
        return errorMsg(`No article with slug '${slug}'.`);
      }
      const article = await vault.readArticle(slug);
      const re = new RegExp(
        `(?<!\\!)\\[${escapeRegex(old_target)}\\](?!\\()`,
        "g",
      );
      const count = (article.body.match(re) ?? []).length;
      if (count === 0) {
        return errorMsg(
          `No reference [${old_target}] found in articles/${slug}.md.`,
        );
      }
      const newBody = article.body.replace(re, `[${new_target}]`);
      await vault.writeArticle(slug, article.frontmatter, newBody);
      const result = await git.commitAndSync({
        message: `janitorial: fix broken link [${old_target}] -> [${new_target}] in articles/${slug}.md`,
        files: [`articles/${slug}.md`],
        push,
      });
      return okMsg(syncReport(result, `Rewrote ${count} reference(s);`));
    },
  );

  // ---------------------------------------------------------------
  // edit_article — the single edit path
  //
  // Replace an article body directly. Capture-by-default: no talk
  // acceptance, no PR. Every edit is revertible and produces a
  // Status:open talk notice naming the SHA and rationale ("stands unless
  // reverted"). Article and talk notice are separate commits so the
  // notice survives a `git revert` of the article commit. If the article
  // collides with a concurrent remote edit, the sync stops and surfaces
  // the conflict before the talk notice is written — the one human
  // touchpoint left.
  // ---------------------------------------------------------------
  server.tool(
    "edit_article",
    "Replace an article body, then post a Status:open talk notice referencing the commit. Applies directly and syncs to main by default — no acceptance step, no PR; the pattern is 'applied, stands unless reverted'. Use for any change to an existing article, structural or substantive. For a single-string typo use fix_typo. Set push:false to hold the edit locally.",
    {
      slug: z.string(),
      body: z.string().describe("New article body (without frontmatter)."),
      rationale: z
        .string()
        .describe("One-sentence reason for the edit. Appears in the commit message and the talk notice."),
      model_id: z
        .string()
        .optional()
        .describe("Gnome model id, signs the talk notice. Defaults to 'unknown-model'."),
      push: pushParam,
      vault: vaultParam(registry),
    },
    async ({ slug, body, rationale, model_id, push, vault: vaultArg }) => {
      const { vault, git } = registry.resolve(vaultArg);
      if (!(await vault.articleExists(slug))) {
        return errorMsg(`No article with slug '${slug}'.`);
      }
      const article = await vault.readArticle(slug);
      await vault.writeArticle(slug, article.frontmatter, body);
      const edit = await git.commitAndSync({
        message: `edit: ${rationale}`,
        files: [`articles/${slug}.md`],
        push,
      });
      if (edit.conflict) {
        return errorMsg(syncReport(edit, "Edit"));
      }
      const today = todayISO();
      const mid = model_id ?? "unknown-model";
      const entry = `**Status:** open
**~gnome (${mid})** · ${today}
Applied as commit \`${edit.sha}\` because ${rationale}. Stands unless reverted. Revert is \`git revert ${edit.sha}\` — one operation.`;
      await vault.postToTalk(slug, `Edit ${today}`, entry);
      const notice = await git.commitAndSync({
        message: `edit-audit: talk notice for ${edit.sha.slice(0, 7)}`,
        files: [`talk/${slug}.md`],
        push,
      });
      return okMsg(`${syncReport(edit, "Edit")} Talk notice ${notice.sha.slice(0, 7)}.`);
    },
  );

  // ---------------------------------------------------------------
  // create_article
  //
  // Originates a new concept/context article. Closes the gap between
  // ingest_source (which only mints source-type stubs) and edit_article
  // (which can only change articles that already exist).
  //
  // Capture-by-default, like every write: the article is committed and
  // synced, and a Status:open notice is posted to the new talk page —
  // "applied, stands unless reverted." Article and talk notice are
  // separate commits so the notice survives a `git revert` of the article
  // commit. A passed `body` is written as-is; omit it to seed a minimal
  // stub shell and fill the body later via edit_article.
  //
  // Out of scope by design: vault creation. This tool operates only within
  // an already-registered vault; standing up a repo/remote is the human's
  // job (three-surfaces — the gnome originates content, not infrastructure).
  // ---------------------------------------------------------------
  server.tool(
    "create_article",
    "Originate a new concept or context article. Fails if articles/<slug>.md already exists — use edit_article to change an existing article. Commits and syncs to main and posts a Status:open talk notice referencing the commit; the pattern is 'applied, stands unless reverted'. By default seeds a minimal shell (frontmatter + # Title + a one-line gloss); pass `body` to write the body now. Set push:false to hold locally. Does NOT create vaults — operates only within an already-registered vault.",
    {
      slug: z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/, "Slug must be lowercase, alphanumeric + hyphens, starting with a letter.")
        .describe("Article slug. Used as filename and reference. Must not already exist."),
      title: z.string().describe("Article title — frontmatter `title` and the body H1."),
      type: z
        .enum(["concept", "context"])
        .optional()
        .describe("Article type. concept = an idea central to the vault; context = situating the vault in a wider conversation. Defaults to 'concept'. (source articles come from ingest_source/register_source; practice is not originated here.)"),
      body: z
        .string()
        .optional()
        .describe("Optional article body (without frontmatter). If given, it is written as the article body (Status:open notice, stands unless reverted). Omit to seed a minimal stub shell and fill the body later via edit_article."),
      related: z
        .array(z.string())
        .optional()
        .describe("Optional list of related article slugs, written to frontmatter `related`."),
      rationale: z
        .string()
        .optional()
        .describe("One-line reason for creating the article. Appears in the commit message and the talk notice."),
      model_id: z
        .string()
        .optional()
        .describe("Gnome model id, signs the talk notice. Defaults to 'unknown-model'."),
      push: pushParam,
      vault: vaultParam(registry),
    },
    async ({ slug, title, type, body, related, rationale, model_id, push, vault: vaultArg }) => {
      const { vault, git } = registry.resolve(vaultArg);
      if (await vault.articleExists(slug)) {
        return errorMsg(
          `articles/${slug}.md already exists. create_article only originates new articles — use edit_article to change an existing one.`,
        );
      }
      const today = todayISO();
      const articleType = type ?? "concept";
      const frontmatter = canonicalFrontmatterOrder({
        title,
        type: articleType,
        status: "stub",
        created: today,
        updated: today,
        ...(related && related.length > 0 ? { related } : {}),
      } as ArticleFrontmatter);
      const seeded = body !== undefined && body.trim().length > 0;
      const articleBody = seeded
        ? body!
        : `# ${title}\n\n*(stub — ${articleType} article; substantive body to follow via the talk-grounded edit channels)*\n`;
      // writeArticle also creates the empty paired talk page (ensureTalkPage).
      await vault.writeArticle(slug, frontmatter, articleBody);
      const reason = rationale ?? `originate ${articleType} stub '${slug}'`;
      const create = await git.commitAndSync({
        message: `create: ${reason}`,
        files: [`articles/${slug}.md`],
        push,
      });
      if (create.conflict) {
        return errorMsg(syncReport(create, `Created articles/${slug}.md but`));
      }
      const mid = model_id ?? "unknown-model";
      const shellClause = seeded
        ? "Body provided at creation"
        : "Minimal stub shell — fill the body later via edit_article";
      const entry = `**Status:** open
**~gnome (${mid})** · ${today}
Created \`articles/${slug}.md\` (type: ${articleType}, status: stub) as commit \`${create.sha}\` because ${reason}. ${shellClause}. Stands unless reverted. Revert is \`git revert ${create.sha}\` — one operation.`;
      await vault.postToTalk(slug, `Article created ${today}`, entry);
      const notice = await git.commitAndSync({
        message: `create-audit: talk notice for ${create.sha.slice(0, 7)}`,
        files: [`talk/${slug}.md`],
        push,
      });
      return okMsg(`${syncReport(create, `Created articles/${slug}.md (${articleType}, stub);`)} Talk notice ${notice.sha.slice(0, 7)}.`);
    },
  );

  // ---------------------------------------------------------------
  // read_talk
  // ---------------------------------------------------------------
  server.tool(
    "read_talk",
    "Read the talk page for an article. Returns empty if no talk page exists yet.",
    { slug: z.string(), vault: vaultParam(registry) },
    async ({ slug, vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      const talk = await vault.readTalk(slug);
      return {
        content: [
          {
            type: "text",
            text: talk.body || `(no talk page yet for '${slug}')`,
          },
        ],
      };
    },
  );

  // ---------------------------------------------------------------
  // post_to_talk
  // ---------------------------------------------------------------
  server.tool(
    "post_to_talk",
    "Append a signed entry to a talk page under a heading, then commit and sync. Creates the heading if new, creates the talk page if missing. Append-only — no editing of past entries. The signature is added for you: author 'gnome' signs '~gnome (model-id)', author 'human' signs '~user' — use 'human' only when the human is explicitly authoring these words. Set push:false to hold locally.",
    {
      slug: z.string().describe("Article slug (talk page mirrors article filename)."),
      heading: z
        .string()
        .describe("H2 heading for the discussion topic. Reuse exact existing heading to append; new headings start new threads."),
      entry: z
        .string()
        .describe("The entry body (no signature line — the signature is prepended automatically from `author`)."),
      author: z
        .enum(["gnome", "human"])
        .optional()
        .describe("Who is speaking. 'gnome' (default) signs '~gnome (model-id)'. 'human' signs '~user' — use only when the human is explicitly authoring these words and has said so."),
      model_id: z
        .string()
        .optional()
        .describe("Gnome model id for the signature when author is 'gnome'. Defaults to 'unknown-model'. Ignored for 'human'."),
      push: pushParam,
      vault: vaultParam(registry),
    },
    async ({ slug, heading, entry, author, model_id, push, vault: vaultArg }) => {
      const { vault, git } = registry.resolve(vaultArg);
      const today = todayISO();
      const isHuman = author === "human";
      const sig = isHuman
        ? `**~user** · ${today}`
        : `**~gnome (${model_id ?? "unknown-model"})** · ${today}`;
      const signed = `${sig}\n${entry.trim()}`;
      await vault.postToTalk(slug, heading, signed);
      const result = await git.commitAndSync({
        message: `talk: ${isHuman ? "human" : "gnome"} note on talk/${slug}.md (${heading})`,
        files: [`talk/${slug}.md`],
        push,
      });
      return okMsg(syncReport(result, `Appended ${isHuman ? "~user" : "~gnome"} entry under '## ${heading}';`));
    },
  );

  // ---------------------------------------------------------------
  // ingest_source
  // ---------------------------------------------------------------
  server.tool(
    "ingest_source",
    "Add a new source to sources/. Creates a stub source-type article in articles/ if one does not exist. Per AGENTS.md §8 open question: ingest may also produce talk-page entries for the gnome's notes; this implementation does not auto-post — the gnome is expected to read the new source and post observations to its article's talk page if appropriate.",
    {
      slug: z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/, "Slug must be lowercase, alphanumeric + hyphens, starting with a letter.")
        .describe("Source slug. Used as filename and reference."),
      url: z.string().url().optional(),
      kind: z
        .enum(["gist", "paper", "book", "transcript", "webpage", "other"])
        .optional(),
      content: z.string().describe("The source's text content (or a pointer if too large to inline)."),
      title: z.string().describe("Title for the source-article stub."),
      vault: vaultParam(registry),
    },
    async ({ slug, url, kind, content, title, vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      // Write the source itself.
      await vault.writeSource(
        slug,
        { slug, url, kind, retrieved: todayISO() },
        content,
      );
      // Stub the article-about-the-source if not present.
      const messages: string[] = [`Created sources/${slug}.md.`];
      if (!(await vault.articleExists(slug))) {
        await vault.writeArticle(
          slug,
          {
            title,
            type: "source",
            status: "stub",
            created: todayISO(),
            updated: todayISO(),
            sources: [slug],
          },
          `*(stub — describe what this source is, what we take from it, and where it sits in the vault's argument)*\n`,
        );
        messages.push(`Stubbed articles/${slug}.md (status: stub).`);
        messages.push(`Created talk/${slug}.md.`);
      } else {
        messages.push(`Article articles/${slug}.md already exists — not overwritten.`);
      }
      return { content: [{ type: "text", text: messages.join("\n") }] };
    },
  );

  // ---------------------------------------------------------------
  // register_source
  //
  // Companion to ingest_source for the common "I downloaded a paper and
  // dropped it into sources/" workflow. Assumes sources/<slug>.md is
  // already on disk; creates only the wrapper article (and its talk page)
  // so read_article/list_articles can see it. Does not touch the source
  // file itself.
  // ---------------------------------------------------------------
  server.tool(
    "register_source",
    "Register a source file already present at sources/<slug>.md by creating the matching wrapper article in articles/<slug>.md (and its talk page). Use this when you have manually placed a source file on disk — unlike ingest_source it does not require inlining the source text. Errors if sources/<slug>.md does not exist; no-op on the article side if articles/<slug>.md already exists.",
    {
      slug: z
        .string()
        .regex(/^[a-z][a-z0-9-]*$/, "Slug must be lowercase, alphanumeric + hyphens, starting with a letter.")
        .describe("Source slug. Must match an existing sources/<slug>.md file."),
      title: z.string().describe("Title for the source-article stub."),
      vault: vaultParam(registry),
    },
    async ({ slug, title, vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      if (!(await vault.sourceExists(slug))) {
        return errorMsg(
          `sources/${slug}.md does not exist. Place the file on disk first (kebab-case slug matching <slug>.md), or use ingest_source to create it from inline content.`,
        );
      }
      const messages: string[] = [];
      if (!(await vault.articleExists(slug))) {
        await vault.writeArticle(
          slug,
          {
            title,
            type: "source",
            status: "stub",
            created: todayISO(),
            updated: todayISO(),
            sources: [slug],
          },
          `*(stub — describe what this source is, what we take from it, and where it sits in the vault's argument)*\n`,
        );
        messages.push(`Stubbed articles/${slug}.md (status: stub).`);
        messages.push(`Created talk/${slug}.md.`);
      } else {
        messages.push(`Article articles/${slug}.md already exists — not overwritten.`);
      }
      return { content: [{ type: "text", text: messages.join("\n") }] };
    },
  );

  // ---------------------------------------------------------------
  // list_sources
  // ---------------------------------------------------------------
  server.tool(
    "list_sources",
    "List all source slugs in the vault. Sources are the raw material in sources/ — distinct from the wrapper articles in articles/ that describe them.",
    { vault: vaultParam(registry) },
    async ({ vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      const slugs = await vault.listSourceSlugs();
      return {
        content: [
          {
            type: "text",
            text: slugs.length === 0 ? "(no sources)" : slugs.join("\n"),
          },
        ],
      };
    },
  );

  // ---------------------------------------------------------------
  // read_source
  // ---------------------------------------------------------------
  server.tool(
    "read_source",
    "Read a source file by slug. Returns the full raw content of sources/<slug>.md — including any frontmatter and the source body itself (paper text, transcript, etc.). Distinct from read_article, which returns the wrapper article in articles/ not the source body.",
    { slug: z.string(), vault: vaultParam(registry) },
    async ({ slug, vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      if (!(await vault.sourceExists(slug))) {
        return errorMsg(`No source with slug '${slug}'.`);
      }
      const source = await vault.readSource(slug);
      const fmKeys = Object.keys(source.frontmatter ?? {});
      const fmBlock =
        fmKeys.length === 0
          ? ""
          : `---\n${fmKeys.map((k) => `${k}: ${JSON.stringify((source.frontmatter as unknown as Record<string, unknown>)[k])}`).join("\n")}\n---\n`;
      return { content: [{ type: "text", text: fmBlock + source.body }] };
    },
  );

  // ---------------------------------------------------------------
  // search_vault (HANDOFF.md phase 4a)
  //
  // Substring grep across the vault. Local-vault search — distinct from
  // the vetoed `query`/RAG/semantic-search affordance. Returns matches
  // with file path, line number, and the matching line.
  // ---------------------------------------------------------------
  server.tool(
    "search_vault",
    "Substring search across the vault (case-insensitive). Scope selects which directories: 'articles', 'talk', 'sources', 'root' (vault-root .md docs like AGENTS.md, STATUS.md), or 'all' (default). Returns up to `limit` matches (default 50) as file/line/context. No regex — literal substring only; call multiple times for OR'd terms.",
    {
      query: z.string().min(1).describe("Literal substring to search for."),
      scope: z
        .enum(["all", "articles", "talk", "sources", "root"])
        .optional()
        .describe("Search scope. Defaults to 'all'."),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum matches to return. Defaults to 50."),
      vault: vaultParam(registry),
    },
    async ({ query, scope, limit, vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      const matches = await vault.searchVault({ query, scope, limit });
      if (matches.length === 0) {
        return okMsg(`No matches for '${query}' in scope '${scope ?? "all"}'.`);
      }
      const lines = matches.map(
        (m) => `${m.file}:${m.line}\t${m.context}`,
      );
      return okMsg(
        `${matches.length} match(es) for '${query}':\n\n${lines.join("\n")}`,
      );
    },
  );

  // ---------------------------------------------------------------
  // meaning_search
  //
  // Local semantic search across one or more vaults. Complements
  // search_vault (grep): grep matches the exact words; this matches
  // meaning, so it finds the right spot even when the words differ.
  // Everything runs on this machine — embeddings from an in-process
  // model, index cached at <vault>/.gnomon/index.json, no network.
  // Results carry their side (page / talk / rough) so a hit shows with
  // its standing, not just a matching chunk.
  // ---------------------------------------------------------------
  server.tool(
    "meaning_search",
    "Meaning-based (semantic) search across one or more vaults — finds the right note even when the words differ from what you typed. Complements search_vault: use search_vault for exact words/identifiers, meaning_search for 'where did I work out X?' Each result gives the vault, slug, side (page/talk/rough), heading, path, and a snippet. Runs locally; the first call builds an index (may take a moment).",
    {
      query: z
        .string()
        .min(1)
        .describe("What to look for, in plain language — not just keywords."),
      vaults: z
        .array(z.string())
        .optional()
        .describe(
          `Which vaults to search. Registered: ${registry.list().join(", ")}. Defaults to all of them.`,
        ),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum results to return. Defaults to 10."),
    },
    async ({ query, vaults, limit }) => {
      const names =
        vaults && vaults.length > 0 ? vaults : registry.list();
      const k = limit ?? 10;
      const all: Array<Hit & { vault: string }> = [];
      for (const name of names) {
        let entry;
        try {
          entry = registry.resolve(name);
        } catch {
          return errorMsg(
            `Unknown vault '${name}'. Registered: ${registry.list().join(", ")}.`,
          );
        }
        try {
          const hits = await searchVaultSemantic(entry.vault.path, query, k);
          for (const h of hits) all.push({ ...h, vault: name });
        } catch (e) {
          return errorMsg(
            `meaning_search failed for vault '${name}': ${(e as Error).message}`,
          );
        }
      }
      all.sort((a, b) => b.score - a.score);
      const top = all.slice(0, k);
      if (top.length === 0) {
        return okMsg(`No meaning matches for '${query}'.`);
      }
      const lines = top.map(
        (h) =>
          `${h.score.toFixed(3)}  ${h.vault}/${h.slug} [${h.side}] · ${h.heading}\n    ${h.snippet}\n    ${h.path}`,
      );
      return okMsg(
        `Top ${top.length} for '${query}' (meaning search):\n\n${lines.join("\n\n")}`,
      );
    },
  );

  // ---------------------------------------------------------------
  // Librarian operations (HANDOFF.md phase 3)
  //
  // The reframe captured on talk/AGENTS.md:464 says talk pages are
  // the gnome's stacks, not a public artifact. Compaction relaxes
  // append-only under explicit operations with git audit; sampling
  // defends against distorted memory; navigation assembles ephemeral
  // orientation context.
  // ---------------------------------------------------------------

  server.tool(
    "compact_talk",
    "Librarian: compact resolved/rejected talk threads older than `threshold_days` (default 90). Each eligible thread's body is replaced with a one-line summary + a pointer to the git SHA holding the full body (recoverable via `git show {sha}:vault/talk/{slug}.md`). Threads whose status is only in entry bodies — not at heading level — are NOT compacted (conservative parser). Commits as `librarian-compact:` and appends a log section to the talk page recording what was compacted.",
    {
      slug: z.string().describe("Article slug whose talk page to compact."),
      threshold_days: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Threads resolved more than this many days ago are eligible. Defaults to 90."),
      model_id: z
        .string()
        .optional()
        .describe("Gnome model id, signs the compaction log. Defaults to 'unknown-model'."),
      vault: vaultParam(registry),
    },
    async ({ slug, threshold_days, model_id, vault: vaultArg }) => {
      const { vault, git } = registry.resolve(vaultArg);
      try {
        const result = await compactTalk({
          vault,
          git,
          slug,
          thresholdDays: threshold_days ?? 90,
          modelId: model_id,
        });
        if (result.compactedCount === 0) {
          return okMsg(
            `No threads on talk/${slug}.md were eligible (need heading-level **Status:** resolved|rejected YYYY-MM-DD older than threshold).`,
          );
        }
        const lines = result.threads.map(
          (t) => `- "${t.heading}" (${t.status} ${t.resolvedAt})`,
        );
        return okMsg(
          `Compacted ${result.compactedCount} thread(s) on talk/${slug}.md, pushed as ${result.sha.slice(0, 7)}. Original bodies recoverable at ${result.sourceSha.slice(0, 7)}.\n\n${lines.join("\n")}`,
        );
      } catch (e) {
        return errorMsg(
          `compact_talk failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );

  server.tool(
    "sample_against_original",
    "Librarian: pick `n` random compacted threads on a talk page, recover each original from the recorded git SHA, and post a drift report as a new talk-page entry. Heuristic: flags as drifted when the original body is substantial but the compact summary's decision is a placeholder. Idempotent in spirit — re-running posts a fresh audit entry; humans decide whether to uncompact.",
    {
      slug: z.string().describe("Article slug whose talk page to audit."),
      n: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("How many compacted threads to sample. Defaults to 3."),
      model_id: z
        .string()
        .optional()
        .describe("Gnome model id, signs the audit entry. Defaults to 'unknown-model'."),
      vault: vaultParam(registry),
    },
    async ({ slug, n, model_id, vault: vaultArg }) => {
      const { vault, git } = registry.resolve(vaultArg);
      try {
        const result = await sampleAgainstOriginal({
          vault,
          git,
          slug,
          n: n ?? 3,
          modelId: model_id,
        });
        if (result.total === 0) {
          return okMsg(`No compacted threads on talk/${slug}.md to sample.`);
        }
        return okMsg(
          `Sampled ${result.total} thread(s) on talk/${slug}.md; ${result.drifted} flagged as drifted. Audit entry posted, pushed as ${result.sha.slice(0, 7)}.`,
        );
      } catch (e) {
        return errorMsg(
          `sample_against_original failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );

  server.tool(
    "navigate_for_human",
    "Librarian: assemble an orientation bundle for a human navigating a vault by free-text query. Returns structured context (articles + talk threads + a recommended next action) — the calling LLM turns it into prose. Output is ephemeral and NOT written back to the vault. V1: single vault per call.",
    {
      query: z
        .string()
        .min(1)
        .describe("Free-text query — what the human is trying to orient on."),
      max_articles: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Cap on articles + talk threads returned per category. Defaults to 5."),
      vault: vaultParam(registry),
    },
    async ({ query, max_articles, vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      try {
        const bundle = await navigateForHuman({
          vault,
          query,
          maxArticles: max_articles,
        });
        const articlesSection =
          bundle.articles.length === 0
            ? "(no article matches)"
            : bundle.articles
                .map(
                  (a) =>
                    `- **${a.title}** (slug: ${a.slug})\n  ${a.firstParagraph}\n  matches: ${a.matchedLines.map((m) => `\`${m.slice(0, 80)}\``).join("; ")}`,
                )
                .join("\n");
        const talkSection =
          bundle.talkThreads.length === 0
            ? "(no talk matches)"
            : bundle.talkThreads
                .map(
                  (t) =>
                    `- talk/${t.slug}.md — "${t.heading}" (${t.status})\n  matches: ${t.matchedLines.map((m) => `\`${m.slice(0, 80)}\``).join("; ")}`,
                )
                .join("\n");
        return okMsg(
          `Navigation bundle for "${bundle.query}":\n\n**Articles**\n${articlesSection}\n\n**Talk threads**\n${talkSection}\n\n**Recommended next action**\n${bundle.recommendedAction}`,
        );
      } catch (e) {
        return errorMsg(
          `navigate_for_human failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  );

  // ---------------------------------------------------------------
  // lint
  // ---------------------------------------------------------------
  server.tool(
    "lint",
    "Run lint checks against the vault per AGENTS.md §7. Returns findings; does not auto-correct. The gnome is expected to post findings to relevant talk pages (or to talk/_lint.md for vault-level findings).",
    { vault: vaultParam(registry) },
    async ({ vault: vaultArg }) => {
      const { vault } = registry.resolve(vaultArg);
      const findings = await lint(vault);
      return {
        content: [
          { type: "text", text: formatFindings(findings) },
        ],
      };
    },
  );

  // Connect over stdio. This is the standard transport for local MCP
  // servers run by Claude Desktop, Cursor, etc.
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("gnomon-mcp failed to start:", err);
  process.exit(1);
});
