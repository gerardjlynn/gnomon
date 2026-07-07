/**
 * Static site generator for a gnomon vault.
 *
 * Renders articles/, talk/, and the AGENTS.md schema into a browseable
 * HTML site at _site/. The key structural choice: each article page
 * shows the article AND its talk page together. This is what makes the
 * article/talk split visually legible — a directory listing of two
 * folders does not.
 *
 * Usage: tsx site/build.ts [vault-path]
 */

import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { marked } from "marked";
import { Vault, Article, TalkPage, ArticleFrontmatter } from "../mcp/vault.js";

const execFileP = promisify(execFile);

interface RootDoc {
  /** Filename without .md, used as the URL slug. */
  name: string;
  /** Title extracted from first H1, or the filename if absent. */
  title: string;
  body: string;
  talkBody: string;
}

interface VaultArticleData {
  slug: string;
  frontmatter: ArticleFrontmatter;
  body: string;
  talk: string;
}

interface VaultRootDocData {
  name: string;
  title: string;
  body: string;
  talk: string;
}

interface VaultData {
  articles: VaultArticleData[];
  rootDocs: VaultRootDocData[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));

interface RenderContext {
  vault: Vault;
  outDir: string;
  articleSlugs: Set<string>;
}

/**
 * Per-vault rendering context for one project's pages. `name` is the URL
 * subdir under the portal ("" for a legacy single-vault root build);
 * `portalHref` links the project home back to the projects landing page
 * (null in legacy mode).
 */
interface SiteContext {
  name: string;
  title: string;
  tagline: string;
  portalHref: string | null;
}

const LEGACY_SITE: SiteContext = {
  name: "",
  title: "Gnomon",
  tagline: "An article/talk split for the LLM wiki pattern.",
  portalHref: null,
};

/** What buildOnce returns so the portal can aggregate across vaults. */
interface ProjectResult {
  name: string;
  title: string;
  tagline: string;
  articleCount: number;
  search: SearchEntry[];
}

async function buildOnce(
  vaultPath: string,
  outDir: string = resolve(vaultPath, "_site"),
  site: SiteContext = LEGACY_SITE,
): Promise<ProjectResult> {
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });

  const vault = new Vault(vaultPath);
  const articleSlugs = await vault.listArticleSlugs();
  const articleSet = new Set(articleSlugs);
  const ctx: RenderContext = { vault, outDir, articleSlugs: articleSet };

  // Configure marked: GFM-ish, no syntax-highlighting, no sanitization
  // (we control the input).
  marked.setOptions({ gfm: true, breaks: false });

  // Load articles and their talk pages once. Talk bodies are reused for
  // rendering, the structured vault data, and the search index.
  const articles = await Promise.all(
    articleSlugs.map((slug) => vault.readArticle(slug)),
  );
  const talks = await Promise.all(
    articles.map((a) => vault.readTalk(a.slug)),
  );

  // Render the article. If its talk page has substantive content,
  // also render the talk page as its own URL (`{slug}-talk.html`).
  for (let i = 0; i < articles.length; i++) {
    const html = renderArticlePage(articles[i], talks[i], ctx);
    const outPath = join(outDir, `${articles[i].slug}.html`);
    await writeFile(outPath, html, "utf-8");

    if (!isTalkPageEmpty(talks[i].body)) {
      const talkPageHtml = renderTalkPage(articles[i], talks[i], ctx);
      const talkOutPath = join(outDir, `${articles[i].slug}-talk.html`);
      await writeFile(talkOutPath, talkPageHtml, "utf-8");
    }
  }

  // Render vault-root narrative documents (AGENTS.md, README.md,
  // STATUS.md, synthesis, etc.). HANDOFF.md is operational and
  // excluded from the published surface.
  const rootDocs = await loadRootDocs(vaultPath);
  for (const doc of rootDocs) {
    const html = renderRootDocPage(doc, ctx);
    const outPath = join(outDir, `${doc.name}.html`);
    await writeFile(outPath, html, "utf-8");

    if (!isTalkPageEmpty(doc.talkBody)) {
      const talkPageHtml = renderRootDocTalkPage(doc, ctx);
      const talkOutPath = join(outDir, `${doc.name}-talk.html`);
      await writeFile(talkOutPath, talkPageHtml, "utf-8");
    }
  }

  // Render the index.
  const indexHtml = renderIndex(articles, rootDocs, ctx, site);
  await writeFile(join(outDir, "index.html"), indexHtml, "utf-8");

  // Emit the structured vault data (phase 4e). Substrate is markdown-in-git;
  // this is a derived, queryable view that the search index, future
  // backlinks UI, and any external consumer reads from. Pretty-printed
  // because it's substrate-shaped (grep, diff, browser-inspect), unlike
  // the minified search index which is wire-shaped.
  const vaultData: VaultData = {
    articles: articles.map((a, i) => ({
      slug: a.slug,
      frontmatter: a.frontmatter,
      body: a.body,
      talk: talks[i].body,
    })),
    rootDocs: rootDocs.map((d) => ({
      name: d.name,
      title: d.title,
      body: d.body,
      talk: d.talkBody,
    })),
  };
  const dataDir = join(outDir, "data");
  if (!existsSync(dataDir)) await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, "vault.json"),
    JSON.stringify(vaultData, null, 2),
    "utf-8",
  );

  // Build the search index and search UI page (phase 4b).
  // Now derived from vaultData rather than re-reading talk pages.
  const searchIndex = buildSearchIndex(vaultData);
  await writeFile(
    join(outDir, "index.json"),
    JSON.stringify(searchIndex),
    "utf-8",
  );
  await writeFile(join(outDir, "search.html"), renderSearchPage(), "utf-8");

  // Recent activity page (phase 4f). Combines git commits, signed talk
  // entries, and article frontmatter dates into a single chronological feed.
  const commits = await getGnomeCommits(vaultPath);
  const repoUrl = await getRepoUrl(vaultPath);
  const activity = gatherActivity(vaultData, commits, repoUrl);
  await writeFile(
    join(outDir, "changes.html"),
    renderActivityPage(activity),
    "utf-8",
  );

  // Copy stylesheet.
  const cssSrc = join(__dirname, "styles.css");
  const cssDest = join(outDir, "styles.css");
  if (existsSync(cssSrc)) {
    await copyFile(cssSrc, cssDest);
  }

  // Build timestamp — the browser auto-reload poller fetches this to
  // detect when a rebuild has happened and trigger a page reload.
  await writeFile(
    join(outDir, "build-timestamp.txt"),
    Date.now().toString(),
    "utf-8",
  );

  console.log(
    `Built ${articles.length} article(s) and ${rootDocs.length} root doc(s) → ${outDir}`,
  );

  return {
    name: site.name,
    title: site.title,
    tagline: site.tagline,
    articleCount: articles.length,
    search: searchIndex,
  };
}

/**
 * Watch vault/articles, vault/talk, vault/sources, and vault-root .md
 * for changes; rebuild the whole site on each (debounced 200ms). Errors
 * are caught so a bad rebuild doesn't kill the watcher.
 */
async function watch(vaultPath: string): Promise<void> {
  const fsSync = await import("node:fs");
  let timer: NodeJS.Timeout | null = null;
  let inProgress = false;

  const rebuild = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      if (inProgress) {
        rebuild();
        return;
      }
      inProgress = true;
      try {
        await buildOnce(vaultPath);
      } catch (e) {
        console.error(
          "Rebuild failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
      inProgress = false;
    }, 200);
  };

  for (const sub of ["articles", "talk", "sources"]) {
    const dir = resolve(vaultPath, sub);
    if (existsSync(dir)) {
      fsSync.watch(dir, { recursive: true }, (_event, filename) => {
        if (filename && filename.toString().endsWith(".md")) rebuild();
      });
    }
  }
  // Root .md files (AGENTS.md, README.md, STATUS.md, synthesis docs)
  fsSync.watch(vaultPath, (_event, filename) => {
    if (filename) {
      const name = filename.toString();
      if (name.endsWith(".md") && !name.includes("/")) rebuild();
    }
  });

  console.log("Watching vault/ for .md changes (Ctrl-C to stop)...");
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes("--watch");

  // Multi-vault portal mode: repeated `--vault name=path`, output under
  // `--out <dir>` (default `_portal`). Mirrors the MCP's vault-registry
  // syntax so one command builds the unified site.
  const vaultSpecs: { name: string; path: string }[] = [];
  let outRoot: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--vault") {
      const spec = args[++i] ?? "";
      const eq = spec.indexOf("=");
      if (eq === -1) {
        console.error(`--vault expects name=path, got '${spec}'`);
        process.exit(1);
      }
      vaultSpecs.push({
        name: spec.slice(0, eq),
        path: resolve(spec.slice(eq + 1)),
      });
    } else if (args[i] === "--out") {
      outRoot = resolve(args[++i] ?? "_portal");
    }
  }

  if (vaultSpecs.length > 0) {
    const root = outRoot ?? resolve("_portal");
    await buildPortal(vaultSpecs, root);
    if (watchMode) {
      await watchPortal(vaultSpecs, root);
      await new Promise(() => {});
    }
    return;
  }

  // Legacy single-vault mode: render into <vault>/_site.
  const vaultPath = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  await buildOnce(vaultPath);
  if (watchMode) {
    await watch(vaultPath);
    await new Promise(() => {}); // keep the process alive for the watcher
  }
}

function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Optional per-vault display metadata from `<vault>/site.json`
 * ({ title, tagline }). Falls back to a title-cased project name.
 */
async function readSiteMeta(
  vaultPath: string,
  name: string,
): Promise<{ title: string; tagline: string }> {
  const p = join(vaultPath, "site.json");
  if (existsSync(p)) {
    try {
      const j = JSON.parse(await readFile(p, "utf-8"));
      return {
        title: typeof j.title === "string" ? j.title : titleCase(name),
        tagline: typeof j.tagline === "string" ? j.tagline : "",
      };
    } catch {
      /* fall through to defaults */
    }
  }
  return { title: titleCase(name), tagline: "" };
}

/**
 * Multi-vault build: render each vault into `<root>/<name>/`, then emit a
 * top-level projects home, a combined search index, shared styles, and a
 * single root build-timestamp the per-page auto-reload poller reads.
 */
async function buildPortal(
  specs: { name: string; path: string }[],
  root: string,
): Promise<void> {
  if (!existsSync(root)) await mkdir(root, { recursive: true });

  const results: ProjectResult[] = [];
  for (const spec of specs) {
    const meta = await readSiteMeta(spec.path, spec.name);
    const site: SiteContext = {
      name: spec.name,
      title: meta.title,
      tagline: meta.tagline,
      portalHref: "../index.html",
    };
    results.push(await buildOnce(spec.path, join(root, spec.name), site));
  }

  // Combined search across all projects: prefix each URL with its project
  // subdir and tag the entry with the project label.
  const combined: SearchEntry[] = [];
  for (const r of results) {
    for (const e of r.search) {
      combined.push({ ...e, url: `${r.name}/${e.url}`, project: r.title });
    }
  }
  await writeFile(join(root, "index.json"), JSON.stringify(combined), "utf-8");
  await writeFile(join(root, "search.html"), renderSearchPage(), "utf-8");
  await writeFile(join(root, "index.html"), renderPortal(results), "utf-8");

  const cssSrc = join(__dirname, "styles.css");
  if (existsSync(cssSrc)) await copyFile(cssSrc, join(root, "styles.css"));
  await writeFile(
    join(root, "build-timestamp.txt"),
    Date.now().toString(),
    "utf-8",
  );

  console.log(
    `Portal: ${results.length} project(s) → ${root}\n` +
      results
        .map((r) => `  /${r.name}/  (${r.articleCount} article(s))`)
        .join("\n"),
  );
}

function renderPortal(projects: ProjectResult[]): string {
  const cards = projects
    .map(
      (p) => `  <li class="project-card">
    <h2><a href="${escape(p.name)}/index.html">${escape(p.title)}</a></h2>
    ${p.tagline ? `<p class="tagline"><em>${escape(p.tagline)}</em></p>` : ""}
    <p class="project-meta">${p.articleCount} article(s) · <a href="${escape(p.name)}/search.html">search</a> · <a href="${escape(p.name)}/changes.html">activity</a></p>
  </li>`,
    )
    .join("\n");
  const body = `
<header class="site-header">
  <h1>Gnomon</h1>
  <p class="tagline"><em>Projects in the vault — an article/talk split for the LLM wiki pattern.</em></p>
  <p class="site-nav"><a href="search.html">Search all projects</a></p>
</header>

<main class="index-main">
  <ul class="project-list">
${cards}
  </ul>
</main>

<footer class="site-footer">
  <p>One MCP, federated storage — each project versions in its own repo.</p>
</footer>
`;
  return wrap("Gnomon — projects", body);
}

/** Portal watch: rebuild the whole portal when any vault's .md changes. */
async function watchPortal(
  specs: { name: string; path: string }[],
  root: string,
): Promise<void> {
  const fsSync = await import("node:fs");
  let timer: NodeJS.Timeout | null = null;
  let inProgress = false;
  const rebuild = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      if (inProgress) return rebuild();
      inProgress = true;
      try {
        await buildPortal(specs, root);
      } catch (e) {
        console.error(
          "Rebuild failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
      inProgress = false;
    }, 200);
  };
  for (const spec of specs) {
    for (const sub of ["articles", "talk", "sources"]) {
      const dir = resolve(spec.path, sub);
      if (existsSync(dir)) {
        fsSync.watch(dir, { recursive: true }, (_e, f) => {
          if (f && f.toString().endsWith(".md")) rebuild();
        });
      }
    }
    fsSync.watch(spec.path, (_e, f) => {
      if (f) {
        const n = f.toString();
        if (n.endsWith(".md") && !n.includes("/")) rebuild();
      }
    });
  }
  console.log("Watching vaults for .md changes (Ctrl-C to stop)...");
}

/**
 * Resolve gnomon-style [slug] internal links to <a href="slug.html">.
 * Conservative: only matches [slug] where slug is a known article and
 * the bracket is not followed by ( (which would make it a regular
 * markdown link).
 */
function resolveInternalLinks(text: string, articleSet: Set<string>): string {
  return text.replace(
    /(?<!\!)\[([a-z][a-z0-9-]*)\](?!\()/g,
    (match, slug) => {
      if (articleSet.has(slug)) {
        return `<a class="internal-link" href="${slug}.html">${slug}</a>`;
      }
      // Broken internal link — render as visible warning rather than
      // silently leaving it as plaintext. The lint operation also
      // surfaces these.
      return `<span class="broken-link" title="No article with this slug">[${slug}]</span>`;
    },
  );
}

interface TOCEntry {
  level: 2 | 3;
  id: string;
  text: string;
}

/**
 * Walk an article's rendered HTML, add anchor IDs to h2/h3 headings
 * (slugified from heading text, deduplicated), and extract a flat TOC.
 * The TOC drives the sticky sidebar on article pages; the IDs make the
 * `#section` URL anchors work.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'");
}

/**
 * Slugify a heading into the anchor id form used for `#section` links.
 * Shared by addAnchorsAndExtractTOC (which sets the heading ids on rendered
 * pages) and parseTalkSignatures (which deep-links to them from the activity
 * feed), so the two cannot drift apart.
 */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Strip the inline markdown that can appear in a raw `## ` heading so the
 * slug derived from markdown matches the slug addAnchorsAndExtractTOC derives
 * from the rendered-then-tag-stripped HTML (code spans, bold/italic, links).
 */
function stripInlineMarkdown(s: string): string {
  return s
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
}

function addAnchorsAndExtractTOC(
  html: string,
): { html: string; toc: TOCEntry[] } {
  const toc: TOCEntry[] = [];
  const slugCounts = new Map<string, number>();
  const newHtml = html.replace(
    /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g,
    (_full, levelStr, attrs, inner) => {
      const level = parseInt(levelStr, 10) as 2 | 3;
      // Decode entities so the slug/TOC text uses real chars instead of
      // `&#39;` etc. Re-escape happens at render time via `escape()`.
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim();
      let slug = slugifyHeading(text);
      const count = slugCounts.get(slug) ?? 0;
      if (count > 0) slug = `${slug}-${count}`;
      slugCounts.set(slug, count + 1);
      toc.push({ level, id: slug, text });
      return `<h${level} id="${slug}"${attrs}>${inner}</h${level}>`;
    },
  );
  return { html: newHtml, toc };
}

function renderTOC(toc: TOCEntry[]): string {
  if (toc.length === 0) return "";
  const items = toc
    .map(
      (t) =>
        `<li class="toc-${t.level}"><a href="#${t.id}">${escape(t.text)}</a></li>`,
    )
    .join("\n      ");
  return `<nav class="toc" aria-label="Contents">
    <h3>Contents</h3>
    <ul>
      ${items}
    </ul>
  </nav>`;
}

/**
 * Is this talk page empty / just a stub? Used to decide both whether
 * to surface a "Discussion" link in the article header and whether to
 * emit a separate talk page HTML at all.
 */
function isTalkPageEmpty(talkBody: string): boolean {
  const stripped = talkBody ? talkBody.replace(/^\s*#\s+[^\n]*\n+/, "") : "";
  const trimmed = stripped.trim();
  return !trimmed || /^\*?\(empty\)\*?$/i.test(trimmed);
}

/** Count `## ` H2 threads in a talk body (used for the discussion-link badge). */
function countTalkThreads(talkBody: string): number {
  const stripped = talkBody ? talkBody.replace(/^\s*#\s+[^\n]*\n+/, "") : "";
  return (stripped.match(/^## /gm) || []).length;
}

function renderArticlePage(
  article: Article,
  talk: TalkPage,
  ctx: RenderContext,
): string {
  const fm = article.frontmatter;
  // Strip the leading H1 from the body — the title is rendered in the
  // article header. Conventionally articles start with `# Title` as a
  // first line; we drop it when rendering.
  const body = article.body.replace(/^\s*#\s+[^\n]*\n+/, "");
  const rawArticleHtml = marked.parse(
    resolveInternalLinks(body, ctx.articleSlugs),
  ) as string;
  const { html: articleHtml, toc } = addAnchorsAndExtractTOC(rawArticleHtml);
  const talkEmpty = isTalkPageEmpty(talk.body);
  const threadCount = countTalkThreads(talk.body);
  const discussionLink = talkEmpty
    ? ""
    : ` · <a href="${article.slug}-talk.html">Discussion${threadCount > 0 ? ` (${threadCount})` : ""} →</a>`;

  const related = (fm.related ?? [])
    .map((slug) =>
      ctx.articleSlugs.has(slug)
        ? `<a href="${slug}.html">${slug}</a>`
        : `<span class="broken-link">${slug}</span>`,
    )
    .join(", ");

  const sources = (fm.sources ?? []).map((s) => `<code>${s}</code>`).join(", ");

  return wrap(
    fm.title,
    `
<div class="article-page">
  ${renderTOC(toc)}
  <div class="article-main">
    <header class="article-header">
      <p class="breadcrumb"><a href="index.html">← all articles</a>${discussionLink}</p>
      <h1>${escape(fm.title)}</h1>
      <dl class="frontmatter">
        <dt>type</dt><dd><span class="badge badge-type-${fm.type}">${fm.type}</span></dd>
        <dt>status</dt><dd><span class="badge badge-status-${fm.status}">${fm.status}</span></dd>
        <dt>created</dt><dd>${escape(fm.created)}</dd>
        <dt>updated</dt><dd>${escape(fm.updated)}</dd>
        ${related ? `<dt>related</dt><dd>${related}</dd>` : ""}
        ${sources ? `<dt>sources</dt><dd>${sources}</dd>` : ""}
      </dl>
    </header>

    <main class="article-body">
      ${articleHtml}
    </main>
  </div>
</div>
`,
  );
}

/**
 * Render a talk page as its own HTML page. Linked from the article
 * page's header via a "Discussion (N) →" affordance when there's
 * substantive content. Reuses the article-page layout (TOC sidebar
 * + main column) so threads (H2 sections) are navigable. The label
 * "Discussion" replaces the Wikipedia-laden "Talk:" register on the
 * human-facing surface; schema-side it's still a talk page.
 */
function renderTalkPage(
  article: Article,
  talk: TalkPage,
  ctx: RenderContext,
): string {
  const fm = article.frontmatter;
  const talkBodyStripped = talk.body.replace(/^\s*#\s+[^\n]*\n+/, "");
  const rawTalkHtml = marked.parse(
    resolveInternalLinks(talkBodyStripped, ctx.articleSlugs),
  ) as string;
  const { html: talkHtml, toc } = addAnchorsAndExtractTOC(rawTalkHtml);

  return wrap(
    `Discussion: ${fm.title}`,
    `
<div class="article-page">
  ${renderTOC(toc)}
  <div class="article-main">
    <header class="article-header">
      <p class="breadcrumb"><a href="${article.slug}.html">← back to ${escape(fm.title)}</a></p>
      <h1>Discussion: ${escape(fm.title)}</h1>
      <p class="talk-note">Working notes — drafts, source disagreements, decisions
      about what's settled. Append-only in practice.</p>
    </header>

    <main class="article-body">
      ${talkHtml}
    </main>
  </div>
</div>
`,
  );
}

/**
 * Discover vault-root narrative documents — top-level .md files that
 * aren't articles, aren't HANDOFF.md (operational). Reads each plus
 * its paired talk page if one exists.
 */
async function loadRootDocs(vaultPath: string): Promise<RootDoc[]> {
  const entries = await readdir(vaultPath);
  const docs: RootDoc[] = [];
  for (const f of entries) {
    if (!f.endsWith(".md")) continue;
    if (f === "HANDOFF.md") continue;
    const name = f.replace(/\.md$/, "");
    const body = await readFile(join(vaultPath, f), "utf-8");
    const titleMatch = body.match(/^\s*#\s+([^\n]+)/);
    const title = titleMatch ? titleMatch[1].trim() : name;
    const talkPath = join(vaultPath, "talk", f);
    const talkBody = existsSync(talkPath)
      ? await readFile(talkPath, "utf-8")
      : "";
    docs.push({ name, title, body, talkBody });
  }
  return docs.sort((a, b) => a.name.localeCompare(b.name));
}

function renderRootDocPage(doc: RootDoc, ctx: RenderContext): string {
  // Strip leading H1 — the title is rendered in the header.
  const body = doc.body.replace(/^\s*#\s+[^\n]*\n+/, "");
  const rawBodyHtml = marked.parse(
    resolveInternalLinks(body, ctx.articleSlugs),
  ) as string;
  const { html: bodyHtml, toc } = addAnchorsAndExtractTOC(rawBodyHtml);
  const talkEmpty = isTalkPageEmpty(doc.talkBody);
  const threadCount = countTalkThreads(doc.talkBody);
  const discussionLink = talkEmpty
    ? ""
    : ` · <a href="${doc.name}-talk.html">Discussion${threadCount > 0 ? ` (${threadCount})` : ""} →</a>`;
  return wrap(
    doc.title,
    `
<div class="article-page">
  ${renderTOC(toc)}
  <div class="article-main">
    <header class="article-header">
      <p class="breadcrumb"><a href="index.html">← all articles</a>${discussionLink}</p>
      <h1>${escape(doc.title)}</h1>
      <p class="frontmatter"><em>Vault-root narrative document.</em></p>
    </header>

    <main class="article-body">
      ${bodyHtml}
    </main>
  </div>
</div>
`,
  );
}

/**
 * Render the discussion page for a root doc (AGENTS, README, etc.).
 * Lives at `{name}-talk.html`; back-link points at the root doc.
 */
function renderRootDocTalkPage(doc: RootDoc, ctx: RenderContext): string {
  const talkStripped = doc.talkBody.replace(/^\s*#\s+[^\n]*\n+/, "");
  const rawTalkHtml = marked.parse(
    resolveInternalLinks(talkStripped, ctx.articleSlugs),
  ) as string;
  const { html: talkHtml, toc } = addAnchorsAndExtractTOC(rawTalkHtml);
  return wrap(
    `Discussion: ${doc.title}`,
    `
<div class="article-page">
  ${renderTOC(toc)}
  <div class="article-main">
    <header class="article-header">
      <p class="breadcrumb"><a href="${doc.name}.html">← back to ${escape(doc.title)}</a></p>
      <h1>Discussion: ${escape(doc.title)}</h1>
      <p class="talk-note">Working notes — drafts, source disagreements, decisions
      about what's settled. Append-only in practice.</p>
    </header>

    <main class="article-body">
      ${talkHtml}
    </main>
  </div>
</div>
`,
  );
}

interface SearchEntry {
  type: "article" | "root";
  title: string;
  url: string;
  content: string;
  /** Project label, set only in the combined portal index. */
  project?: string;
}

/**
 * Build the JSON search index for client-side substring search.
 * One entry per rendered page; the entry concatenates article (or root
 * doc) body with the paired talk body, since they're shown together.
 * Derived from vaultData — no I/O.
 */
function buildSearchIndex(data: VaultData): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const a of data.articles) {
    entries.push({
      type: "article",
      title: a.frontmatter.title,
      url: `${a.slug}.html`,
      content: `${a.body}\n\n---TALK---\n\n${a.talk}`,
    });
  }
  for (const d of data.rootDocs) {
    entries.push({
      type: "root",
      title: d.title,
      url: `${d.name}.html`,
      content: `${d.body}\n\n---TALK---\n\n${d.talk}`,
    });
  }
  return entries;
}

function renderSearchPage(): string {
  // Inline-style minimal HTML; the styles.css inherited from wrap()
  // provides typography. Search is client-side substring filter against
  // index.json, with surrounding-context snippets.
  return wrap(
    "Search",
    `
<header class="article-header">
  <p class="breadcrumb"><a href="index.html">← all articles</a></p>
  <h1>Search</h1>
  <p class="frontmatter"><em>Substring search across articles, talk pages, and vault-root narrative documents. Case-insensitive.</em></p>
</header>

<main class="article-body">
  <p>
    <input id="q" type="search" placeholder="Type to search…" autocomplete="off" autofocus
      style="font-size:1.1em;padding:0.5em;width:100%;max-width:30em;">
  </p>
  <p id="status" class="empty"><em>Type at least 2 characters.</em></p>
  <ul id="results" class="article-list"></ul>
</main>

<script>
(function () {
  var input = document.getElementById('q');
  var status = document.getElementById('status');
  var results = document.getElementById('results');
  var data = null;
  var pending = null;

  fetch('index.json').then(function (r) { return r.json(); }).then(function (j) {
    data = j;
    if (pending !== null) render(pending);
  }).catch(function () {
    status.textContent = 'Failed to load index.json. Are you serving the site over HTTP (not opening as file://)?';
  });

  function escape(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function snippet(content, q) {
    var lower = content.toLowerCase();
    var idx = lower.indexOf(q);
    if (idx === -1) return '';
    var start = Math.max(0, idx - 60);
    var end = Math.min(content.length, idx + q.length + 60);
    var before = escape(content.slice(start, idx));
    var match = escape(content.slice(idx, idx + q.length));
    var after = escape(content.slice(idx + q.length, end));
    return (start > 0 ? '…' : '') + before + '<mark>' + match + '</mark>' + after + (end < content.length ? '…' : '');
  }

  function render(q) {
    results.innerHTML = '';
    if (q.length < 2) {
      status.textContent = 'Type at least 2 characters.';
      return;
    }
    if (!data) {
      pending = q;
      status.textContent = 'Loading…';
      return;
    }
    var lower = q.toLowerCase();
    var hits = 0;
    for (var i = 0; i < data.length; i++) {
      var doc = data[i];
      var hay = (doc.title + '\\n' + doc.content).toLowerCase();
      if (hay.indexOf(lower) === -1) continue;
      var li = document.createElement('li');
      var projBadge = doc.project ? '<code class="badge">' + escape(doc.project) + '</code> ' : '';
      li.innerHTML = '<a href="' + encodeURI(doc.url) + '">' + escape(doc.title) + '</a> ' + projBadge + '<code class="badge">' + doc.type + '</code><br><span class="snippet">' + snippet(doc.content, lower) + '</span>';
      results.appendChild(li);
      hits++;
      if (hits >= 50) break;
    }
    status.textContent = hits === 0 ? 'No matches.' : hits + ' result(s).';
  }

  input.addEventListener('input', function () { render(input.value); });
})();
</script>
`,
  );
}

interface GnomeCommit {
  sha: string;
  date: string;
  prefix: string;
  subject: string;
}

interface ActivityEntry {
  date: string; // YYYY-MM-DD
  kind: "talk" | "commit" | "article-created" | "article-updated";
  /** Author for talk entries ("user", "gnome (claude-opus-4-7)") and commits; empty for article events. */
  author: string;
  /** Display title — thread heading, commit subject, or article title. */
  title: string;
  /** Where the entry lives — article title for talk, commit prefix, article type. */
  context: string;
  /** Link target — article page, commit URL, etc. */
  url: string;
  /** Optional preview text. */
  snippet?: string;
  /** Commit SHA for commit entries (used for the SHA badge). */
  sha?: string;
}

/**
 * Extract signed entries from a talk page body. Each entry pairs the
 * most recent H2 thread heading with a `**~name** · YYYY-MM-DD`
 * signature line and a short snippet of the entry body.
 *
 * Matches both top-level and blockquoted (replied) signatures — the
 * thread heading is the same for both, since blockquotes are nested
 * replies under the same H2.
 */
function parseTalkSignatures(
  talkBody: string,
  hostTitle: string,
  talkUrl: string,
): ActivityEntry[] {
  const lines = talkBody.split("\n");
  let currentH2 = "";
  let currentAnchor = "";
  // Mirror addAnchorsAndExtractTOC's per-page dedup so the deep link resolves
  // to the heading's actual id. (That function dedups across h2+h3 together;
  // here we only see h2, which matches in practice since talk threads use
  // unique H2 headings and replies are blockquotes, not h3.)
  const slugCounts = new Map<string, number>();
  const entries: ActivityEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      currentH2 = h2Match[1].trim();
      let slug = slugifyHeading(stripInlineMarkdown(currentH2));
      const count = slugCounts.get(slug) ?? 0;
      if (count > 0) slug = `${slug}-${count}`;
      slugCounts.set(slug, count + 1);
      currentAnchor = slug;
      continue;
    }
    // Match both the single-signer operational form (`**~name** · date`) and
    // the joint-authored deliberative form codified in AGENTS.md §5
    // (`**Human & ~gnome (model-id)** · date`). The captured author keeps its
    // own `~` so the renderer doesn't re-add one.
    const sigMatch = line.match(
      /^>?\s*\*\*([^*]*~[^*]+)\*\*\s+·\s+(\d{4}-\d{2}-\d{2})/,
    );
    if (sigMatch && currentH2) {
      let snippet = "";
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const next = lines[j].trim().replace(/^>\s*/, "").trim();
        if (next.length > 0 && !next.startsWith("**Status:")) {
          snippet = next.slice(0, 140);
          break;
        }
      }
      entries.push({
        date: sigMatch[2],
        kind: "talk",
        author: sigMatch[1].trim(),
        title: currentH2,
        context: hostTitle,
        url: `${talkUrl}#${currentAnchor}`,
        snippet,
      });
    }
  }
  return entries;
}

/**
 * Combine git commits, signed talk entries, and article frontmatter
 * dates into a unified activity feed. Sorted descending by date.
 */
function gatherActivity(
  vaultData: VaultData,
  commits: GnomeCommit[],
  repoUrl: string | null,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  for (const a of vaultData.articles) {
    entries.push(
      ...parseTalkSignatures(a.talk, a.frontmatter.title, `${a.slug}-talk.html`),
    );
    entries.push({
      date: a.frontmatter.created,
      kind: "article-created",
      author: "",
      title: a.frontmatter.title,
      context: a.frontmatter.type,
      url: `${a.slug}.html`,
    });
    if (a.frontmatter.updated !== a.frontmatter.created) {
      entries.push({
        date: a.frontmatter.updated,
        kind: "article-updated",
        author: "",
        title: a.frontmatter.title,
        context: a.frontmatter.type,
        url: `${a.slug}.html`,
      });
    }
  }

  for (const d of vaultData.rootDocs) {
    entries.push(
      ...parseTalkSignatures(d.talk, d.title, `${d.name}-talk.html`),
    );
  }

  for (const c of commits) {
    entries.push({
      date: c.date,
      kind: "commit",
      author: "",
      title: c.subject,
      context: c.prefix,
      url: repoUrl ? `${repoUrl}/commit/${c.sha}` : "",
      sha: c.sha,
    });
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Pull the most recent gnome-authored commits from `git log`, filtered by
 * the commit-message prefixes used in phases 2 and 3 (janitorial, bold,
 * bold-audit, authorial, audit). Multiple --grep flags OR together.
 */
async function getGnomeCommits(vaultPath: string): Promise<GnomeCommit[]> {
  const prefixes = ["janitorial", "bold", "bold-audit", "authorial", "audit"];
  const grepArgs = prefixes.flatMap((p) => ["--grep", `^${p}:`]);
  try {
    const { stdout } = await execFileP("git", [
      "-C",
      vaultPath,
      "log",
      ...grepArgs,
      "--max-count=50",
      "--pretty=format:%H%x09%ad%x09%s",
      "--date=short",
    ]);
    return stdout
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((line) => {
        const [sha, date, subject] = line.split("\t");
        const m = subject.match(/^([a-z-]+):\s*(.*)$/);
        const prefix = m ? m[1] : "other";
        const rest = m ? m[2] : subject;
        return { sha, date, prefix, subject: rest };
      });
  } catch {
    return [];
  }
}

/**
 * Resolve the GitHub web URL for the origin remote. Returns null if the
 * remote isn't a recognized GitHub URL or git fails — the changes page
 * then renders SHAs as plain text.
 */
async function getRepoUrl(vaultPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP("git", [
      "-C",
      vaultPath,
      "remote",
      "get-url",
      "origin",
    ]);
    const url = stdout.trim();
    let m = url.match(/^git@github\.com:(.+?)(?:\.git)?$/);
    if (m) return `https://github.com/${m[1]}`;
    m = url.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/);
    if (m) return `https://github.com/${m[1]}`;
    return null;
  } catch {
    return null;
  }
}

function renderActivityPage(entries: ActivityEntry[]): string {
  const items = entries
    .map((e) => {
      const kindBadge = `<code class="badge badge-kind-${escape(e.kind)}">${escape(e.kind)}</code>`;
      const author = e.author
        ? `<span class="activity-author">${escape(e.author)}</span>`
        : "";
      const titleHtml = e.url
        ? `<a href="${escape(e.url)}">${escape(e.title)}</a>`
        : escape(e.title);
      const contextHtml = e.context
        ? ` <span class="activity-context">${e.kind === "talk" ? "in " : ""}${escape(e.context)}</span>`
        : "";
      const shaHtml =
        e.kind === "commit" && e.sha
          ? ` ${e.url ? `<a class="sha" href="${escape(e.url)}"><code>${escape(e.sha.slice(0, 7))}</code></a>` : `<code>${escape(e.sha.slice(0, 7))}</code>`}`
          : "";
      const snippetHtml = e.snippet
        ? `<p class="activity-snippet">${escape(e.snippet)}</p>`
        : "";
      return `<li>
  <div class="activity-row">
    <span class="date">${escape(e.date)}</span>
    ${kindBadge}
    ${titleHtml}${contextHtml}
    ${author}${shaHtml}
  </div>
  ${snippetHtml}
</li>`;
    })
    .join("\n");
  const body = `
<header class="article-header">
  <p class="breadcrumb"><a href="index.html">← all articles</a></p>
  <h1>Recent activity</h1>
  <p class="frontmatter"><em>Signed talk entries, article creations and updates, and gnome git commits. Sorted by date, most recent first. Built from <code>vault.json</code> and <code>git log</code>.</em></p>
</header>

<main class="article-body">
  ${entries.length === 0 ? `<p class="empty"><em>No activity yet.</em></p>` : `<ul class="activity-list">\n${items}\n</ul>`}
</main>
`;
  return wrap("Recent activity", body);
}

function renderIndex(articles: Article[], rootDocs: RootDoc[], ctx: RenderContext, site: SiteContext): string {
  const grouped: Record<string, Article[]> = {
    concept: [],
    context: [],
    practice: [],
    source: [],
  };
  for (const a of articles) {
    const t = a.frontmatter.type;
    if (grouped[t]) grouped[t].push(a);
  }

  const section = (label: string, type: keyof typeof grouped) => {
    const list = grouped[type];
    if (list.length === 0) return "";
    const items = list
      .sort((a, b) => a.frontmatter.title.localeCompare(b.frontmatter.title))
      .map((a) => {
        const statusBadge =
          a.frontmatter.status !== "current"
            ? ` <span class="badge badge-status-${a.frontmatter.status}">${a.frontmatter.status}</span>`
            : "";
        return `<li><a href="${a.slug}.html">${escape(a.frontmatter.title)}</a>${statusBadge}</li>`;
      })
      .join("\n");
    return `
<section>
  <h2>${label}</h2>
  <ul class="article-list">${items}</ul>
</section>`;
  };

  const rootSection = rootDocs.length === 0 ? "" : `
<section>
  <h2>Schema and orientation</h2>
  <ul class="article-list">
${rootDocs
  .map((d) => `    <li><a href="${d.name}.html">${escape(d.title)}</a> <code class="badge">${d.name}.md</code></li>`)
  .join("\n")}
  </ul>
</section>`;

  const tagline = site.tagline
    ? `\n  <p class="tagline"><em>${escape(site.tagline)}</em></p>`
    : "";
  const portalLink = site.portalHref
    ? `<a href="${site.portalHref}">← all projects</a> · `
    : "";
  // The gnomon-specific intro only makes sense in the gnomon vault; other
  // projects get a generic line so the links never dangle.
  const hasGnomonIntro =
    ctx.articleSlugs.has("gnomon") && ctx.articleSlugs.has("article-talk-split");
  const intro = hasGnomonIntro
    ? `<p>This is an example gnomon vault — articles, talk pages, and the schema that
  governs them. See <a href="gnomon.html">gnomon</a> for what gnomon is, and
  <a href="article-talk-split.html">article/talk split</a> for the structural commitment.</p>`
    : `<p>Articles, talk pages, and the schema that governs them.</p>`;

  const body = `
<header class="site-header">
  <h1>${escape(site.title)}</h1>${tagline}
  <p class="site-nav">${portalLink}<a href="search.html">Search</a> · <a href="changes.html">Recent activity</a></p>
</header>

<main class="index-main">
  ${intro}

  ${rootSection}
  ${section("Concepts", "concept")}
  ${section("Context", "context")}
  ${section("Practice", "practice")}
  ${section("Sources", "source")}
</main>

<footer class="site-footer">
  <p>Schema: <code>AGENTS.md</code> in the source repo.</p>
</footer>
`;
  return wrap(site.title, body);
}

function wrap(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} · Gnomon</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
${body}
<script>
// Auto-reload poller: fetches /build-timestamp.txt every 2s. When the
// timestamp changes (a watcher rebuild happened), reloads the page.
// Cheap, fails silently if served without the timestamp file (e.g. a
// static deploy without the watcher running).
(function () {
  var initial = null;
  setInterval(function () {
    fetch('/build-timestamp.txt?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (ts) {
        if (ts === null) return;
        ts = ts.trim();
        if (initial === null) { initial = ts; return; }
        if (ts !== initial) location.reload();
      })
      .catch(function () { /* ignore */ });
  }, 2000);
})();
</script>
</body>
</html>
`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
