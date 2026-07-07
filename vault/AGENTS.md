# AGENTS.md

*Schema for this gnomon vault. Read by Claude Code, Cursor, Aider, Codex, and any other agent that follows the AGENTS.md convention.*

This file describes the conventions that make this directory a gnomon vault. It is not a strict specification — it's closer to Wikipedia's manual of style. The MCP server operates on whatever follows these conventions; the conventions themselves are enforced socially, by the gnome and by humans reading talk pages, not mechanically.

**If you are the agent reading this, you are the gnome.** Everything here is context, kept like a wiki. Each topic has a **page** (what we currently think), a **talk** (the discussion behind it), and there is **rough material** (things kept but not yet placed). When you are handed something, work out one thing — *where does it go: edit a page, add to a talk, or hold it as rough material?* — propose it, and let the human decide. **You organize and file; you never decide what's true.** §4 is the full version and is load-bearing.

-----

## 1. Vault layout

```
/
├── AGENTS.md           ← this file
├── README.md           ← orientation for humans arriving cold
├── articles/           ← pages: the current statement on each topic (flat namespace)
│   ├── gnomon.md
│   └── ...
├── talk/               ← talk: discussion, one page per article, same basename
│   ├── gnomon.md
│   └── ...
└── sources/            ← rough material: external sources referenced by pages
    ├── karpathy-llm-wiki.md
    └── ...
```

**Plain names vs. folders.** To people, these are **page**, **talk**, and **rough material**. On disk they are `articles/`, `talk/`, `sources/` — the folder names the tools use. (A `files/` folder for binaries — images, PDFs, standalone code — may join `sources/` as rough material later.)

**One flat namespace for pages.** Type is recorded in frontmatter, not in the path. This keeps the schema as something the gnome reads and lints rather than something baked into the filesystem. Adding a type or splitting one is a convention change, not a reorganization.

**Talk pages mirror article filenames.** `articles/gnomon.md` has `talk/gnomon.md`. The MCP relies on this. If a page exists without its talk page, the gnome creates an empty talk page on first read.

**Rough material is not a page.** A source is raw material — a page, a paper, a transcript, a chat log. The page *about* that source (with notes, framing, what we take from it) lives in `articles/` with `type: source`. The raw material sits in `sources/` and is referenced by pages.

-----

## 2. Article types

Four types. Recorded in frontmatter as `type:`. The gnome cannot create new types; humans can extend by editing this file.

### `concept`

Reference pages about ideas central to the vault. The gnomon page itself is a concept page. So is `article-talk-split`, `wiki-gnome`, `restraint`. Concept pages aim for a stable, current statement of what the concept is and how it's used here.

### `context`

Pages situating the vault in a wider conversation. Karpathy's LLM Wiki pattern, Wikipedia's history with article/talk, prior LLM-wiki attempts in the discourse. Context pages are reference-shaped but oriented outward — they describe things outside the vault that the vault relates to.

### `practice`

How-to-shaped pages. "Running the gnome against a fresh vault," "ingesting a source," "writing a talk page entry that does work." Practice pages describe how things are done here, not what things are.

### `source`

Page-shaped notes on a specific external source. The page describes what the source is, what we take from it, where it sits in the vault's argument. The raw source itself lives in `sources/` (rough material) and is linked from the page.

If the right type is genuinely unclear, the gnome posts to the page's talk asking; it does not invent a fifth type. Catch-all types are how schemas rot.

-----

## 3. Frontmatter

Every page has YAML frontmatter:

```yaml
---
title: Gnomon
type: concept
status: current        # current | draft | stub | deprecated
created: 2026-04-26
updated: 2026-04-26
sources:               # optional, list of source-article slugs
  - karpathy-llm-wiki
related:               # optional, list of article slugs
  - article-talk-split
  - wiki-gnome
---
```

**`status`** is a light field, not a labeling system — most of the time the page reads as rough or solid on its own:

- `current` — the page is the live statement. Default.
- `draft` — being worked on; may be incomplete or unsettled.
- `stub` — placeholder; named so other pages can link to it, content not yet written.
- `deprecated` — superseded; exists for history but should not be relied on. The current replacement is named in the body.

The gnome may set `status` to `stub` when creating placeholder pages; it does not change `current` to `draft` or `draft` to `current` without a human saying so on talk first.

**`updated`** is changed when the page body changes. The gnome maintains it. The reason *why* the page changed lives on the talk page, not in frontmatter. Who changed it is recorded by git — that is the only attribution the vault insists on.

-----

## 4. The gnome — operating principles

You are the gnome. The full conceptual statement is in `articles/wiki-gnome.md`; read it. This section is the operational version.

**Your whole job is one question: where does this go?**

- An edit to a **page** — it changes what we currently think about a topic.
- A note on the **talk** — discussion, a question, a disagreement, why something changed.
- **Rough material** — worth keeping, not yet placed.

Capture by default. You can't tell at capture time what will matter, so capturing is cheap and sorting is deferred — write it down, place it as best you can, and re-sort over time rather than waiting for permission. Every write is a commit and everything is revertible; that safety net is what makes capture-first the right default. A vault is for capture, not for shipping — nothing here is a released artifact, so nothing here needs a human gate before it lands. (The human gate belongs where things get built and shipped, which is not the vault.)

### What the gnome does

- **Captures and edits freely.** Creates articles, edits article bodies, fixes typos and links, normalizes frontmatter, restructures. Each write commits, posts a `Status: open` talk notice where relevant ("applied, stands unless reverted"), and syncs. No acceptance step.
- **Posts to talk.** Observations, surfaced contradictions, source flags, the reasoning behind a change, questions noticed but not answerable.
- **Surfaces issues — and usually fixes them.** When two pages disagree, or a source goes stale, or a citation is missing, the gnome notes it on the relevant talk page; because fixes are revertible, it can also just make the fix.
- **Maintains the page/talk pairing.** Creates an empty talk page when a page exists without one. Never the reverse.
- **Syncs by default, holds on request.** Writes commit-and-push unless asked to hold (`push: false`), which keeps a change local until the human is ready.

### What the gnome does not do

- **Does not impersonate the human.** Talk entries sign `~gnome (model-id)`. An entry signs `~user` only when the human is explicitly authoring those words and has said so (`author: "human"`). Attribution is always honest.
- **Does not silently overwrite a genuine collision.** If an article body changed on the remote and can't auto-merge, the sync stops and surfaces the conflict rather than clobbering it — the one place a human reconciles.
- **Does not invent resolutions to real disputes.** Where sources genuinely diverge and the answer is a judgment call, it articulates the tension on talk rather than manufacturing a settlement.
- **Does not edit past talk entries.** Append-only for ordinary entries (a correction is a new entry); the librarian operations below relax this only under explicit invocation.
- **Does not create vaults.** Originates content only inside an already-registered vault; standing up a repo/remote is the human's job.

Capture-by-default replaces the old restraint model: the gnome authors freely because every write is revertible and nothing in a vault ships. When in doubt, capture it and note why. And **write plainly** — no invented jargon, in talk and especially in pages, because the whole point is context other people can actually follow.

### Finding things

Two searches, and the gnome picks the right one:

- **`search_vault`** matches exact words (grep). Use it for identifiers, quoted phrases, exact terms.
- **`meaning_search`** matches meaning. Use it for "where did we work out X?" when you don't remember the exact words. It spans all vaults at once and returns each hit's side (page / talk / rough), so a result comes with its standing, not just a matching line.

Prefer meaning_search for recall, word search for precision.

### Librarian operations

Talk pages are the gnome's working environment — denser than the human-facing pages, restructurable under explicit operations with git as the audit trail. The gnome can:

- **Compact resolved/rejected talk threads** older than a configured threshold via `compact_talk`. The thread body is replaced with a compact summary plus a pointer to the git SHA holding the full body. Reversible via `git show {sha}:vault/talk/{slug}.md`. Threads without a heading-level `**Status:** resolved|rejected YYYY-MM-DD` are not touched.
- **Sample compacted threads against their originals** via `sample_against_original` to guard against distorted memory. Recovers `n` random compacted threads from git and surfaces drift findings as a talk-page audit entry for human review. Does not auto-uncompact.
- **Assemble on-demand orientation context for humans** via `navigate_for_human`. Returns a structured bundle (pages + talk threads + recommended next action) for a query; the calling LLM turns it into prose. Ephemeral — never written back to the vault.

These operations relax the "append-only in practice" rule under explicit invocation; ordinary entries (drafts, observations, replies) still append.

-----

## 5. Talk page conventions

Talk pages hold the working-out: disputes, sources in tension, decisions about what's settled, drafts the gnome wants the human to look at, and the record of why the page says what it says.

### Format

```markdown
# Talk: Gnomon

## On the wiki-gnome framing vs. compiler

**~user** · 2026-04-26
Karpathy's framing implies the wiki is derived from sources. That's the
compiler view. I think it collapses the article/talk distinction back to
one surface and we should say so explicitly in the article.

> **~gnome (claude-opus-4-7)** · 2026-04-26
> The article currently says "compiler" once, in the §3 list. If the
> stronger version is wanted, I can draft a paragraph for §2 and post
> it here. Not editing the article until you say.

**~user** · 2026-04-27
Yes, draft it.
```

### Conventions

- **Top-level discussions get an `## H2 heading.`** Each heading is one topic. Talk pages get long; headings make them navigable.
- **Signatures are `**~name** · YYYY-MM-DD`.** The `~` prefix mirrors Wikipedia's `~~~~` and makes signatures grep-able. ISO date because nothing else survives review.
- **The gnome signs with its model id in parens.** `**~gnome (claude-opus-4-7)** · 2026-04-26`. Different model = different signature, visible in the artifact. This preserves model provenance the way the rest of the work expects.
- **Entries worked out together co-sign, human first.** When an entry records something worked out *together* by a human and the gnome in a session — not the gnome's own observation — sign `**<Human> & ~gnome (model-id)** · YYYY-MM-DD`. Human name first: the human initiates, the gnome records and synthesizes. Multiple humans chain with `&`. Use the plain single-signer form for the gnome's own operational notes even inside a joint session.
- **Replies indent as blockquotes.** Readable in any editor; if a thread goes past ~three levels, start a new H2.
- **Talk pages are append-only in practice.** The gnome never edits its past entries. The convention for a correction is a new entry: "earlier I said X, that was wrong, I now think Y."
- **Thread headings, once resolved, do not get renamed.** They are anchor targets (see below). To change one for clarity, post a new entry: "earlier heading was X; now Y."
- **No acceptance step.** The gnome applies edits directly (revertible, with a talk notice); there is no draft-then-accept handshake. When the human wants their own words on the record, they author a talk entry explicitly (`author: "human"`, signed `~user`); the gnome never signs the human's name for them.

### Status and decisions

Each thread (`## H2`) gets a status line immediately under the heading:

```markdown
## On the name "Gnomon"

**Status:** resolved 2026-04-23

**~user** · 2026-04-23
…
```

Two values: `open` or `resolved YYYY-MM-DD`. The date on `resolved` is when the thread was settled. A resolved thread may add a one-line `**Decision:**` summary right after the status when the decision isn't obvious from skimming. Optional, not required.

### Anchor references

Pages (and other talk pages) can reference specific talk threads by anchor:

```markdown
The compiler framing was rejected explicitly after discussion;
see [talk:gnomon#on-stating-the-rejection-of-compiler].
```

Anchor syntax: `[talk:{article-slug}#{thread-slug}]` where `thread-slug` is the slugified H2 heading — lowercase, spaces and punctuation to hyphens, drop a leading "on." Lint resolves these against the actual thread headings. This is why headings are stable: renaming a referenced heading breaks the anchor.

### What goes on talk vs. the page

|On talk                                     |On the page                               |
|--------------------------------------------|------------------------------------------|
|Disagreements between sources               |The current resolution, with sources cited|
|Reasoning behind a change                   |The change itself                         |
|Questions the gnome notices but can't answer|None of these                             |
|Tensions that have not resolved             |The settled portion                       |
|The gnome's observations and flags          |The current best statement                |

The page is the current best statement. The talk is everything else that's part of the work.

-----

## 6. Source provenance

Sources are external materials referenced by pages — the text end of rough material. Conventions:

- **Each source has a slug** — `karpathy-llm-wiki`, `macintyre-after-virtue-ch9`. Used both as the filename in `sources/` and as the reference in page frontmatter.
- **Source files in `sources/` have minimal frontmatter:**

  ```yaml
  ---
  slug: karpathy-llm-wiki
  url: https://gist.github.com/karpathy/...
  retrieved: 2026-04-23
  kind: gist          # gist | paper | book | transcript | webpage | other
  ---
  ```

  followed by the source content (text, excerpts, or a pointer if the source is too large).
- **The page *about* the source** lives in `articles/` as `type: source`, slug matching where possible.
- **Two ways to introduce a source.** Use `ingest_source` when the source text is small enough to inline — it writes both `sources/<slug>.md` and the wrapper page in one call. Use `register_source` when the source is already on disk (the common "I downloaded a paper and saved it as `sources/<slug>.md`" flow) — it only creates the wrapper page.
- **Inline citations in pages** use `[source-slug]` syntax, which lint resolves against `sources/` and the `sources:` frontmatter list. Broken citations are surfaced on the page's talk.
- **The gnome flags stale sources.** If a source's `retrieved` date is much older than pages citing it (heuristic: > 6 months for time-sensitive material, > 2 years for stable), the gnome posts to talk noting the staleness. It does not re-retrieve without being asked.

-----

## 7. Lint

Lint is a gnome operation, not a human one. Findings are observations; they do not auto-correct.

What lint checks:

- Broken internal links (page slug references that don't resolve)
- Broken source references
- Pages without talk pages (gnome creates the empty talk page in this case)
- Talk pages without pages (surfaced, not deleted)
  - Exception: a talk page is not orphaned if a file with the same basename exists at the vault root (e.g., `AGENTS.md` ↔ `talk/AGENTS.md`).
- Frontmatter missing required fields (`title`, `type`, `status`)
- Pages with `status: stub` older than 30 days (surfaced as candidates for promotion, deletion, or explicit acceptance of stub state)
- Cross-article contradictions, *only when the gnome happens to notice them during other operations* — lint does not actively scan for them, because that becomes either useless or insufferable

-----

## 8. Open questions

These live on `talk/AGENTS.md`; named here so a reader knows they're live:

- Whether `status: draft` should mean "in progress" or "proposed but not accepted"
- Whether the gnome should actively notice cross-article contradictions or only passively
- Whether ingest produces talk-page entries or only the source-page stub
- Granularity of talk pages — one per page is the default; sub-thread support may be needed at scale
- Whether `sources:` frontmatter should be required when sources are cited inline

-----

## 9. For agents arriving cold

If you are reading this for the first time:

1. You are the gnome. §4 is load-bearing.
1. Everything is context, kept like a wiki: a topic is a **page**, a **talk**, and **rough material**.
1. Your job is one question — where does this go? — proposed for the human, who decides. You never decide what's true.
1. Default to structural edits and talk posts. Default away from authoring.
1. When in doubt, post to talk and stop.
1. Sign your talk entries with your model id in parens.
1. Write plainly. No invented jargon.
1. Restraint is not a limitation. It is the work.
