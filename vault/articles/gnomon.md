---
title: Gnomon
type: concept
status: current
created: 2026-04-23
updated: 2026-04-26
related:
  - article-talk-split
  - karpathy-llm-wiki
  - wiki-gnome
---

# Gnomon

Gnomon is a small structural addition to the [karpathy-llm-wiki] pattern and a particular framing of what the LLM is doing inside it. The addition is the article/talk split (see [article-talk-split]); the framing is the [wiki-gnome].

The pattern as Karpathy stated it has three layers — raw sources, wiki, schema — and three operations: ingest, query, lint. Single user, single point of view, single voice on every page. That works as a personal knowledge base. It strains the moment more than one person is involved, or the underlying material contains real disagreement.

The article/talk split is the structural move that handles those cases. The gnome framing is what keeps the LLM doing the right work inside it.

## What gnomon adds

Two things, neither novel on its own:

1. **Every article has a talk page.** Articles hold the current best statement. Talk pages hold the working-out — disputes, sources in tension, drafts the LLM proposes for human acceptance, decisions about what's settled and what isn't. The split scaled to the largest collaborative knowledge artifact ever built; importing it costs almost nothing.

2. **The LLM operates as a gnome, not a compiler or maintainer.** It tends structure, posts to talk, and surfaces issues. It does not author articles or resolve disputes. See [wiki-gnome] for the operating principles; AGENTS.md for the schema.

Neither move is original. The contribution is the combination: structural support for disagreement plus a framing of LLM contribution that doesn't collapse it.

## What the article/talk split fixes

The single-surface wiki has to either flatten disagreement into the article or push it out of the system entirely. Both are bad. Flattening produces confident wrongness when sources contradicted; pushing-out loses the working-out that justified the article in the first place.

Two surfaces handles this:

- **Provenance.** Sources can disagree; the talk page is where the disagreement lives. The article cites the resolution, the talk page shows the work.
- **Multi-author.** Two contributors can disagree without one of them having to win. Talk holds the disagreement, the article reflects the consensus reached.
- **Revision rationale.** When the article changes, the talk page records *why*. Git gets the diff; talk gets the discussion.
- **A place for the LLM that isn't the article.** The gnome's observations, flags, and drafts go on talk. The article stays human-authored.
- **Tensions held, not resolved.** Some questions don't have answers. A talk page can hold "we considered X and Y, neither resolved, here's what each implies" indefinitely.

## Why gnome, not compiler

The dominant framings for the LLM in a wiki pattern are *compiler* (sources go in, wiki comes out) and *maintainer* (the LLM keeps the wiki current). Both hand the LLM more authority than it should have.

The compiler framing makes the wiki a derived artifact. This collapses the article/talk distinction back to one surface — if the LLM compiles the article from sources, there's no place for the *working-out*, and the wiki ends up either confidently wrong (sources disagreed, LLM picked) or noncommittal (LLM hedged everything). It also makes the wiki disposable: rebuild from sources whenever, the article is just cache. But the article isn't cache; it's the current statement, which is a different kind of object.

The maintainer framing is closer but still wrong. A maintainer authors revisions, makes editorial decisions, resolves disputes. An LLM doing this is doing it in a register where its mistakes are hard to catch, because edits look authoritative.

The gnome — borrowed from Wikipedia's own subculture for editors who do quiet structural work — is a better fit. A gnome fixes typos, normalizes citation formats, flags broken links, surfaces contradictions, points at gaps. It doesn't author. It doesn't resolve. It surfaces issues for the people who do.

The constraint is not "the LLM is limited." The constraint is "the LLM's contribution is structural tending, and substantive judgment lives elsewhere." That distinction is load-bearing. A gnome that starts authoring articles is no longer a gnome.

## Schema as conventions

Karpathy's schema layer was rules and config. Gnomon's schema is closer to Wikipedia's manual of style: conventions for how articles and talk pages are structured, what counts as a source, what kinds of articles exist for the vault in question. Conventions, not types.

The alternative — strict ontology of article types and required fields — pushes toward the wrong failure mode, where the system enforces a structure the actual material doesn't fit and the LLM ends up either fighting the schema or distorting the content to match it. Wikipedia's manual of style is enforced socially, not mechanically. That's why it can hold the actual variety of human knowledge.

For gnomon, the schema lives in `AGENTS.md` (or `CLAUDE.md`, depending on which agent runs the vault). Different vaults can have different schemas. The MCP server doesn't care; it operates on whatever directory of markdown files follows the conventions.

## What gnomon isn't

It isn't a startup, a product, a hosted service, or a position paper dressed as a tool. It's a studio piece in the idea-file-plus-reference-implementation mode, articulating one structural move and one framing move with an artifact small enough to read in an hour and adapt in a day.

The project enters the [karpathy-llm-wiki] conversation rather than opening a new one. That's the right register for what this is.

## Naming

*Gnomon* is the working name. The gnomon is the part of a sundial that casts the shadow — it marks structure by being a fixed thing the world moves past. It doesn't tell time; it lets time become readable. The etymological connection to *gnome* (both from Greek *gnōmōn*, "one who knows / indicator") preserves the [wiki-gnome] lineage in the name.

The Gnomon Workshop is a different category (artist training); collision is soft. If a different name fits better as the artifact develops, it gets renamed.

## Open questions

Live, not rhetorical:

- Granularity for talk pages. One per article is the default; whether sub-threads need structural support is unclear.
- Whether the gnome should actively notice cross-article contradictions or only respond when asked.
- How the lint operation interacts with talk.
- Whether `ingest` should produce talk-page entries (gnome notes about the source) or only article material.

These get worked out in use. See `talk/gnomon.md` for the live working-out.
