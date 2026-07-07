# Talk: Karpathy's LLM Wiki

## On whether this should be `type: source` or `type: context`

**Status:** resolved 2026-04-23
**Decision:** source.

**~user** · 2026-04-23
First article-shaped notes on Karpathy's gist. Question: does this go in as `type: source` (article about a specific external source) or `type: context` (situating the vault in a wider conversation)?

> **~gnome (claude-opus-4-6)** · 2026-04-23
> Per AGENTS.md §2: a source article is "article-shaped notes on a specific external source — the article describes what the source is, what we take from it, where it sits in the vault's argument." That fits this article exactly.
>
> A context article would be something like `articles/llm-wiki-discourse.md` describing the broader conversation Karpathy's gist landed in (the comment thread, prior LLM-knowledge-base attempts, the gnusupport-style reactions). Different scope.
>
> Recommend `type: source`. The raw gist itself goes in `sources/karpathy-llm-wiki.md` and is referenced from the article frontmatter.

**~user** · 2026-04-23
Yes, source. That's the cleaner read.

> **~gnome (claude-opus-4-6)** · 2026-04-23
> Frontmatter set. `sources/karpathy-llm-wiki.md` stub created with `slug`, `url`, `retrieved`, `kind: gist`. Body of the source file is currently empty — needs the actual gist content pasted in.

---

## On the level of summary

**Status:** resolved 2026-04-24
**Decision:** keep summary, add disclaimer.

**~user** · 2026-04-24
The article currently spends ~200 words summarizing what Karpathy's pattern is (three layers, three operations). Wondering if that's right — should it just say "go read the gist" and skip the summary?

> **~gnome (claude-opus-4-7)** · 2026-04-24
> Two arguments for keeping the summary:
>
> 1. The article is doing positioning work — explaining what gnomon takes from Karpathy and what it adds. That argument doesn't land if the reader doesn't know what they're being told gnomon takes from. The summary is load-bearing for the rest of the article.
> 2. The gist is informal and short, but readers will land on this article from search or from `gnomon.md`'s links. They may not have read the gist; the summary keeps the article self-contained.
>
> Argument against keeping it: any summary of a third-party source is a misrepresentation risk. Someone reading this summary instead of the gist gets gnomon's reading of Karpathy, not Karpathy.
>
> The article currently flags "summary" implicitly with the `## What the pattern is` heading; doesn't explicitly say "this is our reading of the gist, not Karpathy's words." If the summary stays, that disclaimer should be added.

**~user** · 2026-04-24
Add the disclaimer. Summary stays.

> **~gnome (claude-opus-4-7)** · 2026-04-24
> Drafting — add this line below the "## What the pattern is" heading, before the layers/operations:
>
> > What follows is gnomon's summary of the pattern, not Karpathy's own words. The gist itself is short; reading it directly is preferable.
>
> `accept`?

**~user** · 2026-04-24
revise: cut "preferable" — sounds like the article is undermining itself. Just "the gist itself is short; if you have ten minutes, read it directly."

> **~gnome (claude-opus-4-7)** · 2026-04-24
> Revised draft:
>
> > What follows is gnomon's summary of the pattern, not Karpathy's own words. The gist itself is short; if you have ten minutes, read it directly.
>
> `accept`?

**~user** · 2026-04-24
accept

> **~gnome (claude-opus-4-7)** · 2026-04-24
> Applied.

---

## On the "what Karpathy meant by schema" question

**Status:** resolved 2026-04-25
**Decision:** leave flagged, don't pursue.

**~user** · 2026-04-25
The article's "Open questions" section flags whether Karpathy meant `schema` strictly (a config/spec) or loosely (conventions). I lean loose, but the gist is short enough that either reading is plausible. Worth pursuing?

> **~gnome (claude-opus-4-7)** · 2026-04-25
> I'd argue not. Reasons:
>
> 1. Resolving this against Karpathy's intent doesn't change what gnomon does. Gnomon's schema is conventions; that's stated and load-bearing on its own terms. Whether Karpathy would agree is interesting but not architecturally consequential.
> 2. Asking him directly is the only way to resolve it, and that's a different kind of move than this article should make. The studio register is "here's our reading; here's where it might diverge from yours; here's what we built."
> 3. The article already flags the ambiguity. That's enough.
>
> Recommend leaving the open question as flagged and not pursuing further.

**~user** · 2026-04-25
Agreed. Leave it flagged.

---

## On whether to ingest the comment thread

**Status:** open

**~gnome (claude-opus-4-7)** · 2026-04-26
The gist's comment thread had substantive critiques (the gnusupport-style reactions, the no-consensus arguments, the prior-LLM-wiki references). Currently `sources/karpathy-llm-wiki.md` is just the gist content — the comment thread isn't included.

Two questions:

1. Should the comment thread be included as part of the same source, or as a separate source (`sources/karpathy-llm-wiki-comments.md`)?
2. If included, should specific commenters be referenced by handle, or anonymized?

Both are conventions questions, not lint issues. Flagging for human decision.

**~user** · 2026-04-26
Hold both. The comment thread is interesting but not load-bearing for the v1 vault. If gnomon ends up engaging with specific critiques in the article, we add them then.

---

## Cross-article: "since 1995" appears here too

**Status:** resolved 2026-04-26

**~gnome (claude-opus-4-7)** · 2026-04-26
Flagging: the article currently says "The structural answer to all three has existed since 1995" (closing line of the "Where it strains" section). The same date claim was flagged as wrong on `talk/article-talk-split.md` on 2026-04-25 — Wikipedia launched in 2001, the talk namespace pairing is from then or shortly after, not 1995.

The article-talk-split article was corrected at that point. This article wasn't, because the issue was flagged on a different talk page.

Two options:

1. Drop the date entirely — "The structural answer has existed for a couple of decades. See [article-talk-split]."
2. Keep the structure but use the corrected language — "since approximately the early 2000s."

Light preference for option 1; the date isn't doing argumentative work in this article and the link to [article-talk-split] is where someone interested in history should go anyway.

Not editing until you weigh in.

**~user** · 2026-04-26
Option 1. Apply.

> **~gnome (claude-opus-4-7)** · 2026-04-26
> Applied. Replaced "The structural answer to all three has existed since 1995. See [article-talk-split]." with "The structural answer has existed for a couple of decades. See [article-talk-split]."
