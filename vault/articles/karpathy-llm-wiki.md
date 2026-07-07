---
title: Karpathy's LLM Wiki
type: source
status: current
created: 2026-04-23
updated: 2026-04-26
sources:
  - karpathy-llm-wiki
related:
  - gnomon
  - article-talk-split
---

# Karpathy's LLM Wiki

Source: [karpathy-llm-wiki] (gist, April 2026).

The "LLM Wiki" is a pattern Andrej Karpathy described in a public gist in April 2026. It proposes that the right shape for a personal knowledge base in the LLM era is a wiki — readable by humans, queryable by LLMs, populated through a small set of operations. The gist is short (~1500 words), informal, and shaped as an idea file rather than a specification.

It is the immediate context [gnomon] enters. Most of the framing in this vault assumes the reader has either read the gist or knows its contents at the level of summary below.

## What the pattern is

What follows is gnomon's summary of the pattern, not Karpathy's own words. The gist itself is short; if you have ten minutes, read it directly.

Three layers and three operations.

**Layers:**

1. **Raw sources** — the underlying material. Articles, papers, conversations, transcripts, anything that goes in.
2. **Wiki** — a directory of markdown articles. One article per topic. Stable, current, readable.
3. **Schema** — a config file describing the conventions of *this particular* wiki. What kinds of articles exist, how they're formatted, what counts as a source.

**Operations:**

1. **Ingest** — take a source, add or update articles based on it.
2. **Query** — read the wiki, possibly composing across articles, to answer a question.
3. **Lint** — check the wiki against the schema, surface issues.

The LLM does the work for all three operations. The human writes the schema, supplies sources, reads articles, and accepts or rejects LLM proposals.

## What's good about it

The pattern is doing several things right that most "AI for knowledge work" framings miss.

- **The wiki is a real artifact**, readable by humans without the LLM. Markdown files in a directory. No proprietary format, no required runtime, no "ask the AI what's in your notes."
- **The schema is per-vault.** Different domains have different conventions; the pattern doesn't try to enforce a universal one. The LLM's job is partly to read and respect the schema rather than to impose structure.
- **Operations are small and named.** Three operations, each doing one thing. The pattern is small enough to read in fifteen minutes and adapt in an afternoon.
- **It's a studio piece, not a product.** Karpathy's contribution is a clearly stated idea with a reference shape, posted as a gist. Anyone who finds it useful adapts it. This is the right register for ideas of this size.

The combination — readable artifact, per-vault conventions, small operation set, studio register — is what gnomon inherits.

## Where it strains

The pattern as stated is single-user, single-voice. Every article has one perspective; every claim is the LLM's-best-current-statement-given-the-sources. That works for a personal knowledge base, where the user is the authority and the LLM is helping them maintain a current view.

It strains immediately when:

- **Sources contradict.** The LLM either picks (confidently wrong) or hedges (noncommittal). Neither is great; the discussion of *why* one source was preferred has nowhere to live.
- **More than one person contributes.** The single-voice article either flattens both contributors into a compromise or one of them has to win. The disagreement, if it persists, has nowhere to live.
- **The LLM's reasoning matters.** Why did the article change? What did the LLM consider? Without a place for that reasoning, it vanishes the moment the response ends.

The gnusupport-style critiques in the gist's comment thread were almost entirely about these failure modes — sometimes named directly, sometimes as more specific complaints (no provenance, no way to hold disagreement, no consensus mechanism).

The structural answer has existed for a couple of decades. See [article-talk-split].

## What gnomon takes from it

The whole frame, mostly intact:

- The three-layer architecture (raw sources / wiki / schema)
- The wiki as readable markdown directory
- Schema as per-vault conventions
- Small named operation set
- Studio register (idea-file-plus-reference-implementation)

What gnomon changes:

- Adds talk pages, paired with articles, as a structural commitment ([article-talk-split])
- Reframes the LLM's role from compiler/maintainer to gnome ([wiki-gnome])
- Adds two operations to the set: `read_talk` and `post_to_talk` (sources stay; ingest, query, lint stay)

That's the whole thing. The contribution is small by design.

## Where to find it

The gist itself is in `sources/karpathy-llm-wiki.md`. Direct URL is in the source frontmatter.

If reading for the first time: read the gist before the rest of this vault. It's short, and gnomon makes more sense as a delta against it than as a standalone proposal.

## Open questions

- Whether the schema-as-conventions read of Karpathy's pattern is what he intended, or whether his "schema" was meant more strictly. The gist is short enough to support either reading. See `talk/karpathy-llm-wiki.md`.
- Whether the gist's `lint` operation was meant to include LLM-noticed issues (gnomon's reading) or only mechanical schema checks. Resolution probably doesn't matter for the artifact; both fit.
