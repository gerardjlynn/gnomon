/**
 * Librarian operations (HANDOFF phase 3).
 *
 * Three operations that let the gnome maintain its own working
 * environment on talk pages:
 *
 *   - compactTalk: relax the append-only convention by replacing
 *     resolved-and-old thread bodies with compact summaries plus
 *     git pointers. Reversible via `git show`.
 *
 *   - sampleAgainstOriginal: defend against distorted memory.
 *     Pick n random compacted threads, fetch each original from
 *     git, diff against the compact summary, surface drift on the
 *     talk page.
 *
 *   - navigateForHuman: assemble an orientation bundle for a human
 *     navigating a vault. Returns structured context (articles +
 *     talk threads + a recommendation); the calling LLM turns it
 *     into prose. Output is ephemeral — never written back.
 *
 * Talk pages stop being a public artifact (articles are the
 * human-facing surface) and become the gnome's stacks — denser,
 * more structured, restructurable under explicit operations with
 * git as the audit trail.
 */

import { Vault } from "./vault.js";
import { GitOps } from "./git.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";

const execFileP = promisify(execFile);

/**
 * Get the git path (relative to repo root) for a file inside the vault.
 *
 * `git show {sha}:{path}` requires the path to be relative to the
 * repository root, not the current working directory. For gnomon's
 * own repo, that's `vault/talk/{slug}.md`; for a vault-as-repo (the
 * test vault) it's `talk/{slug}.md`. Compute it once and use the
 * same string in both the pointer-text and the recovery command.
 *
 * Note on canonicalization: macOS symlinks `/tmp` → `/private/tmp`, and
 * `git rev-parse --show-toplevel` returns the canonical form. The file
 * path has to be canonicalized too so `relative()` doesn't produce
 * a chain of `..` to climb out of the symlink and back in.
 */
async function gitPath(repoCwd: string, fileInVault: string): Promise<string> {
  const { stdout } = await execFileP(
    "git",
    ["rev-parse", "--show-toplevel"],
    { cwd: repoCwd },
  );
  const root = stdout.trim();
  const fullPath = await realpath(join(repoCwd, fileInVault));
  return relative(root, fullPath);
}

// -----------------------------------------------------------------
// Talk-page parsing
// -----------------------------------------------------------------

interface Thread {
  heading: string;
  body: string;
  status: string | null;
  resolvedAt: Date | null;
  decision: string | null;
}

/**
 * Split a talk-page body into (header, threads). Header is
 * everything before the first H2; threads are each H2 section
 * (heading and body included).
 *
 * Each thread is also scanned for a heading-level `**Status:**`
 * and `**Decision:**` line (the convention from AGENTS.md §5).
 * Threads with status only in entry bodies (not at heading level)
 * surface as `status: null` and are skipped by compaction —
 * conservative by design.
 */
function parseTalk(body: string): { header: string; threads: Thread[] } {
  const parts = body.split(/(?=^## )/m);
  const header = parts[0] ?? "";
  const threadParts = parts.slice(1);
  const threads: Thread[] = threadParts.map((part) => {
    const headingMatch = part.match(/^## (.+)$/m);
    const heading = headingMatch ? headingMatch[1].trim() : "";
    const statusMatch = part.match(
      /^\*\*Status:\*\*\s+(resolved|rejected)\s+(\d{4}-\d{2}-\d{2})/m,
    );
    const status = statusMatch ? statusMatch[1] : null;
    const resolvedAt = statusMatch
      ? new Date(statusMatch[2] + "T00:00:00Z")
      : null;
    const decisionMatch = part.match(/^\*\*Decision:\*\*\s+(.+)$/m);
    const decision = decisionMatch ? decisionMatch[1].trim() : null;
    return { heading, body: part, status, resolvedAt, decision };
  });
  return { header, threads };
}

async function lastCommitSha(repoPath: string, file: string): Promise<string> {
  const { stdout } = await execFileP(
    "git",
    ["log", "-1", "--format=%H", "--", file],
    { cwd: repoPath },
  );
  return stdout.trim();
}

// -----------------------------------------------------------------
// compactTalk (HANDOFF 3a)
// -----------------------------------------------------------------

export interface CompactedThread {
  heading: string;
  status: string;
  decision: string;
  resolvedAt: string;
}

export interface CompactionResult {
  slug: string;
  compactedCount: number;
  threads: CompactedThread[];
  sha: string;
  sourceSha: string;
}

/**
 * Compact resolved/rejected threads older than `thresholdDays`. For
 * each eligible thread:
 *   - Replaces its body with a compact summary (status + decision +
 *     pointer to the git SHA holding the full body).
 *   - The full body is recoverable via `git show {sourceSha}:vault/talk/{slug}.md`.
 *
 * Threads without heading-level `**Status:** resolved|rejected YYYY-MM-DD`
 * are NOT touched — the parser is conservative; threads with resolution
 * buried in entry bodies survive uncompacted.
 *
 * The function writes the compacted file and a separate uncompacted
 * "Librarian: compaction on YYYY-MM-DD" log section, then commits both
 * in one `librarian-compact:` commit.
 */
export async function compactTalk(opts: {
  vault: Vault;
  git: GitOps;
  slug: string;
  thresholdDays: number;
  modelId?: string;
  today?: Date;
}): Promise<CompactionResult> {
  const today = opts.today ?? new Date();
  const cutoffMs = today.getTime() - opts.thresholdDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs);
  const mid = opts.modelId ?? "unknown-model";

  const talk = await opts.vault.readTalk(opts.slug);
  if (!talk.body) {
    return { slug: opts.slug, compactedCount: 0, threads: [], sha: "", sourceSha: "" };
  }

  const { header, threads } = parseTalk(talk.body);
  const sourceSha = await lastCommitSha(
    opts.vault.path,
    `talk/${opts.slug}.md`,
  );
  const repoRelTalkPath = await gitPath(opts.vault.path, `talk/${opts.slug}.md`);

  const compactedThreads: CompactedThread[] = [];
  const newThreadBodies = threads.map((thread) => {
    if (!thread.status || !thread.resolvedAt || thread.resolvedAt > cutoff) {
      return thread.body;
    }
    const decision =
      thread.decision ?? `(no decision recorded; see ${sourceSha.slice(0, 7)})`;
    const todayISO = today.toISOString().slice(0, 10);
    const resolvedISO = thread.resolvedAt.toISOString().slice(0, 10);
    compactedThreads.push({
      heading: thread.heading,
      status: thread.status,
      decision,
      resolvedAt: resolvedISO,
    });
    return `## ${thread.heading}\n\n**Status:** ${thread.status} ${resolvedISO}\n**Decision:** ${decision}\n\n*Compacted by ~gnome (${mid}) on ${todayISO}. Full thread body in git: \`git show ${sourceSha}:${repoRelTalkPath}\`*\n\n`;
  });

  if (compactedThreads.length === 0) {
    return { slug: opts.slug, compactedCount: 0, threads: [], sha: "", sourceSha };
  }

  const newBody = header + newThreadBodies.join("");
  const todayISO = today.toISOString().slice(0, 10);
  const logEntries = compactedThreads
    .map((t) => `- "${t.heading}" (${t.status} ${t.resolvedAt})`)
    .join("\n");
  const logSection = `\n## Librarian: compaction on ${todayISO}\n\n**~gnome (${mid})** · ${todayISO}\n\nCompacted ${compactedThreads.length} thread(s); full bodies recoverable at \`${sourceSha}\`:\n\n${logEntries}\n`;

  const fullNewBody = newBody.trimEnd() + "\n" + logSection;
  await writeFile(
    join(opts.vault.path, "talk", `${opts.slug}.md`),
    fullNewBody,
    "utf-8",
  );

  const { sha } = await opts.git.commitAndSync({
    message: `librarian-compact: ${opts.slug}, ${compactedThreads.length} thread(s)`,
    files: [`talk/${opts.slug}.md`],
  });

  return {
    slug: opts.slug,
    compactedCount: compactedThreads.length,
    threads: compactedThreads,
    sha,
    sourceSha,
  };
}

// -----------------------------------------------------------------
// sampleAgainstOriginal (HANDOFF 3b)
// -----------------------------------------------------------------

export interface SampledThread {
  heading: string;
  status: string;
  sourceSha: string;
  drifted: boolean;
  note: string;
}

export interface SampleResult {
  slug: string;
  sampled: SampledThread[];
  drifted: number;
  total: number;
  sha: string;
}

/**
 * Sample n random compacted threads on a talk page; recover each
 * original from the recorded git SHA; surface drift findings as a
 * new talk-page entry.
 *
 * Drift heuristic is rough by design: if the original thread body
 * is substantial (>200 chars of text) and the compact summary's
 * decision is the placeholder string, flag as drifted. More
 * sophisticated diff heuristics can come later; the deliverable is
 * the talk-page entry for human review, not an autonomous decision.
 */
export async function sampleAgainstOriginal(opts: {
  vault: Vault;
  git: GitOps;
  slug: string;
  n: number;
  modelId?: string;
}): Promise<SampleResult> {
  const mid = opts.modelId ?? "unknown-model";
  const talk = await opts.vault.readTalk(opts.slug);
  const { threads } = parseTalk(talk.body);

  type Candidate = { thread: Thread; sourceSha: string; sourcePath: string; decision: string };
  const compacted: Candidate[] = [];
  for (const t of threads) {
    // Compacted threads carry their own pointer; parse both the SHA
    // and the repo-relative path so we recover with the same string
    // we wrote.
    const shaMatch = t.body.match(/`git show ([0-9a-f]+):(\S+?)`/);
    if (!shaMatch) continue;
    const decisionMatch = t.body.match(/^\*\*Decision:\*\*\s+(.+)$/m);
    compacted.push({
      thread: t,
      sourceSha: shaMatch[1],
      sourcePath: shaMatch[2],
      decision: decisionMatch?.[1] ?? "",
    });
  }

  if (compacted.length === 0) {
    return { slug: opts.slug, sampled: [], drifted: 0, total: 0, sha: "" };
  }

  const shuffled = [...compacted].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, Math.min(opts.n, shuffled.length));

  const sampled: SampledThread[] = [];
  for (const item of sample) {
    let origBody = "";
    try {
      const { stdout } = await execFileP(
        "git",
        ["show", `${item.sourceSha}:${item.sourcePath}`],
        { cwd: opts.vault.path },
      );
      origBody = stdout;
    } catch (e) {
      sampled.push({
        heading: item.thread.heading,
        status: item.thread.status ?? "?",
        sourceSha: item.sourceSha,
        drifted: true,
        note: `Could not recover from git: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    const { threads: origThreads } = parseTalk(origBody);
    const orig = origThreads.find((t) => t.heading === item.thread.heading);
    if (!orig) {
      sampled.push({
        heading: item.thread.heading,
        status: item.thread.status ?? "?",
        sourceSha: item.sourceSha,
        drifted: true,
        note: "Original thread not found at recorded SHA",
      });
      continue;
    }

    const origLen = orig.body.length;
    const isPlaceholder = item.decision.startsWith("(no decision recorded");
    const drifted = origLen > 200 && isPlaceholder;
    sampled.push({
      heading: item.thread.heading,
      status: item.thread.status ?? "?",
      sourceSha: item.sourceSha,
      drifted,
      note: drifted
        ? `Original ~${origLen} chars; compact summary is placeholder. Worth uncompacting.`
        : `Compact summary appears consistent with original (~${origLen} chars).`,
    });
  }

  const drifted = sampled.filter((s) => s.drifted).length;
  const todayISO = new Date().toISOString().slice(0, 10);
  const entry = `**~gnome (${mid})** · ${todayISO}

Sampled ${sample.length} compacted thread(s); ${drifted} flagged as potentially drifted.

${sampled.map((s) => `- "${s.heading}" (${s.status}) at \`${s.sourceSha.slice(0, 7)}\`: ${s.note}`).join("\n")}`;

  await opts.vault.postToTalk(opts.slug, `Librarian: audit ${todayISO}`, entry);
  const { sha } = await opts.git.commitAndSync({
    message: `librarian-audit: ${opts.slug}, ${sample.length} sampled, ${drifted} drifted`,
    files: [`talk/${opts.slug}.md`],
  });

  return { slug: opts.slug, sampled, drifted, total: sample.length, sha };
}

// -----------------------------------------------------------------
// navigateForHuman (HANDOFF 3c)
// -----------------------------------------------------------------

export interface NavigationArticle {
  slug: string;
  title: string;
  firstParagraph: string;
  matchedLines: string[];
}

export interface NavigationTalkThread {
  slug: string;
  heading: string;
  status: string;
  matchedLines: string[];
}

export interface NavigationBundle {
  query: string;
  articles: NavigationArticle[];
  talkThreads: NavigationTalkThread[];
  recommendedAction: string;
}

/**
 * Assemble an orientation bundle for a human navigating the vault
 * by a free-text query. Aggregates `searchVault` hits into article
 * and talk-thread groups, attaches first-paragraph context for
 * articles and the containing thread heading for talk hits, and
 * proposes a single recommended next action.
 *
 * The calling LLM turns the bundle into prose. The output is
 * ephemeral — never written back to the vault. V1 operates on one
 * vault per call; cross-vault navigation is a candidate for later
 * when there are >2 vaults registered.
 */
export async function navigateForHuman(opts: {
  vault: Vault;
  query: string;
  maxArticles?: number;
}): Promise<NavigationBundle> {
  const maxArticles = opts.maxArticles ?? 5;

  const articleHits = await opts.vault.searchVault({
    query: opts.query,
    scope: "articles",
    limit: 50,
  });
  const talkHits = await opts.vault.searchVault({
    query: opts.query,
    scope: "talk",
    limit: 50,
  });

  // Aggregate article hits by slug, preserving first-seen order.
  const articleSlugSet = new Set<string>();
  const articleSlugs: string[] = [];
  for (const h of articleHits) {
    const slug = h.file.replace(/^articles\//, "").replace(/\.md$/, "");
    if (!articleSlugSet.has(slug)) {
      articleSlugSet.add(slug);
      articleSlugs.push(slug);
    }
  }

  const articles: NavigationArticle[] = [];
  for (const slug of articleSlugs.slice(0, maxArticles)) {
    const a = await opts.vault.readArticle(slug);
    const firstParagraph = a.body.trim().split(/\n\s*\n/)[0]?.slice(0, 300) ?? "";
    const matched = articleHits
      .filter((h) => h.file === `articles/${slug}.md`)
      .map((h) => h.context);
    articles.push({
      slug,
      title: a.frontmatter.title,
      firstParagraph,
      matchedLines: matched.slice(0, 3),
    });
  }

  // Aggregate talk hits by (slug, thread heading) so each thread
  // surfaces once even if multiple lines match.
  const talkAgg = new Map<string, NavigationTalkThread>();
  const talkBySlug = new Map<string, Array<{ line: number; context: string }>>();
  for (const h of talkHits) {
    const slug = h.file.replace(/^talk\//, "").replace(/\.md$/, "");
    if (!talkBySlug.has(slug)) talkBySlug.set(slug, []);
    talkBySlug.get(slug)!.push({ line: h.line, context: h.context });
  }

  for (const [slug, hits] of talkBySlug) {
    const talk = await opts.vault.readTalk(slug);
    const { threads } = parseTalk(talk.body);
    let cursor = 1;
    const threadLineRanges: Array<{ start: number; end: number; thread: Thread }> = [];
    for (const t of threads) {
      const lines = t.body.split("\n").length;
      threadLineRanges.push({ start: cursor, end: cursor + lines, thread: t });
      cursor += lines;
    }
    for (const hit of hits) {
      const range = threadLineRanges.find(
        (r) => hit.line >= r.start && hit.line < r.end,
      );
      if (!range) continue;
      const key = `${slug}#${range.thread.heading}`;
      if (talkAgg.has(key)) {
        const ex = talkAgg.get(key)!;
        if (ex.matchedLines.length < 3) ex.matchedLines.push(hit.context);
      } else {
        talkAgg.set(key, {
          slug,
          heading: range.thread.heading,
          status: range.thread.status ?? "open",
          matchedLines: [hit.context],
        });
      }
    }
  }
  const talkThreads = Array.from(talkAgg.values()).slice(0, maxArticles);

  let recommendedAction: string;
  if (articles.length > 0) {
    recommendedAction = `Read article "${articles[0].title}" (slug: ${articles[0].slug}) first — top-matching article for the query.`;
  } else if (talkThreads.length > 0) {
    recommendedAction = `Read talk thread "${talkThreads[0].heading}" on talk/${talkThreads[0].slug}.md — best match in working notes.`;
  } else {
    recommendedAction = `No matches for "${opts.query}". Try a broader term, or list_articles to browse what is in the vault.`;
  }

  return { query: opts.query, articles, talkThreads, recommendedAction };
}
