/**
 * Lint — implements the checks from AGENTS.md §7.
 *
 * Lint findings are observations, not auto-corrections. The lint
 * operation returns a structured list of findings; the gnome is
 * expected to post them to the appropriate talk pages and stop.
 *
 * Active cross-article contradiction detection is intentionally NOT
 * implemented here (per AGENTS.md §7 final point — "lint does not
 * actively scan for contradictions, because that becomes either
 * useless or insufferable"). Contradictions noticed during other
 * operations are surfaced ad-hoc, not via lint.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { Vault, Article, todayISO, slugifyHeading } from "./vault.js";

export type Severity = "info" | "warning" | "error";

export interface LintFinding {
  severity: Severity;
  scope: "vault" | "article" | "talk" | "source";
  slug?: string; // omitted for vault-level findings
  message: string;
  /** Where this finding should be posted (talk page slug, or _lint). */
  postTo: string;
}

const REQUIRED_FRONTMATTER = ["title", "type", "status"] as const;
const VALID_TYPES = ["concept", "context", "practice", "source"] as const;
const VALID_STATUSES = ["current", "draft", "stub", "deprecated"] as const;

/**
 * Run all lint checks against the vault. Returns a flat list of
 * findings. The caller decides what to do with them (post to talk,
 * print to stdout, surface in MCP response).
 */
export async function lint(vault: Vault): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];

  const articleSlugs = await vault.listArticleSlugs();
  const talkSlugs = await vault.listTalkSlugs();
  const sourceSlugs = await vault.listSourceSlugs();
  const articleSet = new Set(articleSlugs);
  const sourceSet = new Set(sourceSlugs);

  // Load all articles up front; most checks need them.
  const articles = await Promise.all(
    articleSlugs.map((slug) => vault.readArticle(slug)),
  );

  // Build a map of talk-slug → set of slugified H2 headings, so anchor
  // references like [talk:foo#some-thread] can be resolved.
  const talkAnchors = new Map<string, Set<string>>();
  for (const slug of talkSlugs) {
    const talk = await vault.readTalk(slug);
    const anchors = new Set<string>();
    for (const line of talk.body.split("\n")) {
      const m = line.match(/^##\s+(.+?)\s*$/);
      if (m) anchors.add(slugifyHeading(m[1]));
    }
    talkAnchors.set(slug, anchors);
  }

  for (const article of articles) {
    findings.push(...checkFrontmatter(article));
    findings.push(...checkInternalLinks(article, articleSet));
    findings.push(...checkSourceReferences(article, sourceSet));
    findings.push(...checkStubAge(article));
    findings.push(
      ...checkTalkAnchors(article.slug, "article", article.body, talkAnchors),
    );
  }

  // Talk pages can also contain anchor refs (e.g., audit scars back-reference
  // the originating thread). Lint those too.
  for (const slug of talkSlugs) {
    const talk = await vault.readTalk(slug);
    findings.push(...checkTalkAnchors(slug, "talk", talk.body, talkAnchors));
  }

  // Article/talk pairing.
  for (const slug of articleSlugs) {
    if (!talkSlugs.includes(slug)) {
      findings.push({
        severity: "info",
        scope: "vault",
        message: `Article '${slug}' has no talk page (gnome will create on next read).`,
        postTo: "_lint",
      });
    }
  }
  for (const slug of talkSlugs) {
    if (articleSet.has(slug)) continue;
    // AGENTS.md §7 vault-root exception: a talk page is not orphaned if a
    // file with the same basename exists at the vault root (e.g. talk/AGENTS.md
    // mirrors AGENTS.md). The article/talk split applies to vault-root files
    // as well as to articles/.
    if (existsSync(join(vault.path, `${slug}.md`))) continue;
    findings.push({
      severity: "warning",
      scope: "vault",
      message: `Talk page 'talk/${slug}.md' has no corresponding article. Surfaced, not deleted.`,
      postTo: "_lint",
    });
  }

  // Source-article pairing for type:source articles.
  for (const article of articles) {
    if (article.frontmatter.type === "source") {
      // The convention is that a type:source article has a corresponding
      // file in sources/ with the same slug (or one named in `sources:`
      // frontmatter). Check that at least one matches.
      const expectedSources =
        article.frontmatter.sources ?? [article.slug];
      const missing = expectedSources.filter((s) => !sourceSet.has(s));
      for (const m of missing) {
        findings.push({
          severity: "warning",
          scope: "article",
          slug: article.slug,
          message: `type:source article references missing source file 'sources/${m}.md'.`,
          postTo: article.slug,
        });
      }
    }
  }

  // Stale source check.
  for (const sourceSlug of sourceSlugs) {
    const source = await vault.readSource(sourceSlug);
    if (source.frontmatter.retrieved) {
      const age = daysSince(source.frontmatter.retrieved);
      // Heuristic from AGENTS.md §6: > 6 months for time-sensitive,
      // > 2 years for stable. Lint can't tell which the source is, so
      // it surfaces both thresholds at different severities.
      if (age > 730) {
        findings.push({
          severity: "warning",
          scope: "source",
          slug: sourceSlug,
          message: `Source retrieved ${age} days ago (>2 years). Consider re-retrieving.`,
          postTo: "_lint",
        });
      } else if (age > 180) {
        findings.push({
          severity: "info",
          scope: "source",
          slug: sourceSlug,
          message: `Source retrieved ${age} days ago (>6 months). Consider re-retrieving if time-sensitive.`,
          postTo: "_lint",
        });
      }
    }
  }

  return findings;
}

function checkFrontmatter(article: Article): LintFinding[] {
  const findings: LintFinding[] = [];
  const fm = article.frontmatter as unknown as Record<string, unknown>;

  for (const key of REQUIRED_FRONTMATTER) {
    if (!fm[key]) {
      findings.push({
        severity: "error",
        scope: "article",
        slug: article.slug,
        message: `Frontmatter missing required field: ${key}`,
        postTo: article.slug,
      });
    }
  }

  if (fm.type && !VALID_TYPES.includes(fm.type as (typeof VALID_TYPES)[number])) {
    findings.push({
      severity: "error",
      scope: "article",
      slug: article.slug,
      message: `Invalid type '${fm.type}'. Valid types: ${VALID_TYPES.join(", ")}.`,
      postTo: article.slug,
    });
  }

  if (
    fm.status &&
    !VALID_STATUSES.includes(fm.status as (typeof VALID_STATUSES)[number])
  ) {
    findings.push({
      severity: "error",
      scope: "article",
      slug: article.slug,
      message: `Invalid status '${fm.status}'. Valid statuses: ${VALID_STATUSES.join(", ")}.`,
      postTo: article.slug,
    });
  }

  return findings;
}

function checkInternalLinks(
  article: Article,
  articleSet: Set<string>,
): LintFinding[] {
  // gnomon convention: [slug] resolves to articles/slug.md. Distinguishes
  // from [text](url) markdown links by the absence of a paren.
  // Match [slug] not followed by ( and not preceded by ! (image syntax).
  const findings: LintFinding[] = [];
  const linkRe = /(?<!\!)\[([a-z][a-z0-9-]*)\](?!\()/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(article.body)) !== null) {
    const slug = match[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (!articleSet.has(slug)) {
      findings.push({
        severity: "warning",
        scope: "article",
        slug: article.slug,
        message: `Internal link [${slug}] does not resolve to an existing article.`,
        postTo: article.slug,
      });
    }
  }
  return findings;
}

/**
 * Resolve `[talk:slug#thread-slug]` anchor references against the actual
 * H2 headings on the named talk page. Both the slug and the thread slug
 * must resolve. The `kind` argument controls where unresolved anchors
 * are posted (back to the source article's talk page, or to _lint for
 * talk-page-originated anchors).
 */
function checkTalkAnchors(
  sourceSlug: string,
  kind: "article" | "talk",
  body: string,
  talkAnchors: Map<string, Set<string>>,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const re = /\[talk:([a-z][a-z0-9-]*)#([a-z0-9-]+)\]/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const [whole, slug, threadSlug] = m;
    if (seen.has(whole)) continue;
    seen.add(whole);
    const anchors = talkAnchors.get(slug);
    if (!anchors) {
      findings.push({
        severity: "warning",
        scope: kind === "article" ? "article" : "talk",
        slug: sourceSlug,
        message: `Anchor ${whole} points at talk/${slug}.md, which does not exist.`,
        postTo: sourceSlug,
      });
      continue;
    }
    if (!anchors.has(threadSlug)) {
      findings.push({
        severity: "warning",
        scope: kind === "article" ? "article" : "talk",
        slug: sourceSlug,
        message: `Anchor ${whole} does not match any H2 thread on talk/${slug}.md.`,
        postTo: sourceSlug,
      });
    }
  }
  return findings;
}

function checkSourceReferences(
  article: Article,
  sourceSet: Set<string>,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const declared = new Set(article.frontmatter.sources ?? []);
  for (const slug of declared) {
    if (!sourceSet.has(slug)) {
      findings.push({
        severity: "warning",
        scope: "article",
        slug: article.slug,
        message: `Frontmatter declares source '${slug}' but sources/${slug}.md does not exist.`,
        postTo: article.slug,
      });
    }
  }
  return findings;
}

function checkStubAge(article: Article): LintFinding[] {
  if (article.frontmatter.status !== "stub") return [];
  const age = daysSince(article.frontmatter.created);
  if (age > 30) {
    return [
      {
        severity: "info",
        scope: "article",
        slug: article.slug,
        message: `Stub article is ${age} days old. Candidate for promotion, deletion, or explicit acceptance of stub state.`,
        postTo: article.slug,
      },
    ];
  }
  return [];
}

function daysSince(isoDate: string): number {
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/**
 * Format findings as plain-text output suitable for stdout or for
 * posting to a talk page.
 */
export function formatFindings(findings: LintFinding[]): string {
  if (findings.length === 0) return "Lint clean. No findings.";
  const lines: string[] = [`Lint run ${todayISO()} — ${findings.length} finding(s):\n`];
  for (const f of findings) {
    const tag = f.slug ? `[${f.slug}]` : `[vault]`;
    lines.push(`- ${f.severity.toUpperCase()} ${tag} ${f.message}`);
  }
  return lines.join("\n");
}
