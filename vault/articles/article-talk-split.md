---
title: Article/talk split
type: concept
status: current
created: 2026-04-23
updated: 2026-04-26
related:
  - gnomon
  - karpathy-llm-wiki
  - wiki-gnome
---

# Article/talk split

The article/talk split is the structural commitment that every article in the wiki has a paired talk page. The article holds the current best statement. The talk page holds the working-out — disputes, drafts, source disagreements, decisions about what's settled and what isn't, the historical record of why the article says what it says.

It is the single most important structural feature [gnomon] adopts from Wikipedia. Most of the obvious critiques of the [karpathy-llm-wiki] pattern — no consensus, no provenance, no way to hold disagreement — fall away once articles and talk pages are separate surfaces.

## Where it comes from

Wikipedia has had a talk namespace paired with the article namespace since approximately the project's first year — talk pages were not in the very first MediaWiki software, but the article-talk pairing became standard early enough that it's effectively as old as Wikipedia as a working system. (Exact date of the namespace introduction needs verification; see talk page.)

Before the split, discussion happened on the article itself, which produced exactly the failure mode you'd expect: articles flattened into compromises, edit wars in body text, no record of why anything said what it said. The split was the response.

It became one of the load-bearing structures of the project. Wikipedia has more talk than article, by volume, and the talk pages do work the articles can't. They preserve disagreement, they hold the provenance of decisions, and they give editors a place to be wrong in public without distorting the encyclopedia.

The pattern predates Wikipedia in some senses — Usenet threads, mailing-list archives, lab notebooks all had threaded-discussion-attached-to-content of various kinds. The wiki version is distinctive in two ways: the talk page is structurally paired with a specific article, and substantive changes to the article reference the talk discussion. Discussion is part of the artifact, not adjacent to it.

## What the split does

Two surfaces lets each surface do what it's for. The article presents what's settled enough to present. The talk page presents the working-out, signed and dated and preserved. Neither has to compromise to do the other's job.

The concrete effects:

- **Provenance survives revision.** When an article changes, the talk page is where the *why* lives. Git gets the diff; talk gets the discussion. For LLM-touched content this matters more than for human-edited content, because LLM rationales otherwise vanish entirely.
- **Disagreement doesn't have to resolve.** A talk page can hold "we considered X and Y, neither resolved" indefinitely. The article articulates whatever has settled; the talk page holds the rest.
- **Multiple voices without flattening.** Two contributors disagreeing don't have to merge into a single voice. The talk page holds the disagreement; the article holds whatever consensus they've reached.
- **The LLM has a place.** The gnome's observations, flags, and proposed drafts go on talk. The article stays human-authored. See [wiki-gnome].

## What it isn't

The talk page is not a chat log, comment section, or scratchpad. Those formats degrade — comments don't get read, scratchpads don't get re-read, chat is ephemeral. The talk page is a structural part of the artifact, with conventions (signing, dating, headings, append-only-in-practice) designed for re-reading.

The talk page is also not a draft of the article. Drafts of the article live on the article, in the form of `status: draft` or `status: stub` frontmatter. The talk page is for the discussion *around* drafting, not the draft itself — though the gnome posts proposed text to talk before applying it (see [wiki-gnome]).

It is also not a forum. There's no thread starting from nowhere; threads attach to articles. If a discussion has nothing to attach to, the right move is usually to write the stub article first, then discuss on its talk page.

## Conventions in this vault

See AGENTS.md §5 for the canonical conventions. The short version, repeated here for the reader's convenience (and likely to drift over time, in which case AGENTS.md is authoritative):

- Top-level discussions get an `## H2 heading`. Each heading is one topic.
- Signatures are `**~name** · YYYY-MM-DD`. The gnome signs with model id in parens: `**~gnome (claude-opus-4-7)** · 2026-04-26`.
- Replies indent as blockquotes. Past three levels of nesting, start a new H2.
- Talk pages are append-only in practice. The gnome never edits its past entries; humans technically can, but the convention is to post a new entry saying "earlier I said X, that was wrong, I now think Y."
- The gnome's drafts get accepted with `accept`, redrafted with `revise: …`, or left alone (anything else, or silence).

## Why it works for LLM-tended wikis specifically

The article/talk split was designed for human collaborators. It happens to fit LLM contribution exceptionally well — better, arguably, than it fits the human case it was designed for.

The reason: the split solves the problem of having a lot to say without having authority to say it on the article surface. That's the gnome's situation by design. A wiki gnome — human or LLM — has observations to surface, drafts to propose, contradictions to flag, but doesn't have the standing to author articles. The talk page is the surface that exists for exactly this kind of contribution.

For LLMs the fit is sharpened further by two facts: the talk page makes LLM rationale legible (otherwise it vanishes the moment the response ends), and the talk page is the surface the gnome can post to without violating restraint (see [wiki-gnome]). The article stays human-authored. The talk page absorbs everything else.

## Open questions

- Whether sub-thread structural support is needed at scale. One H2 per topic is the default; current vaults aren't large enough to know.
- Whether ingest operations should produce talk-page entries (the gnome's notes on a freshly-ingested source) or only the source-article stub. Probably both, but the balance is a tuning question.
- Whether the lint operation's findings belong on a single `talk/_lint.md` page or on per-article talk pages. Currently both, depending on whether the issue is article-specific.

These get worked out in use. See `talk/article-talk-split.md`.
