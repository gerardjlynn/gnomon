# Talk: Gnomon

## On the name "Gnomon"

**Status:** resolved 2026-04-23
**Decision:** committed to "Gnomon"; rename if it stops fitting.

**~user** · 2026-04-23
Naming. "Wiki" is taken by Karpathy now. I want something that gestures at the article/talk addition without losing the connection. "Gnomon" came up — sundial part, etymological root shared with "gnome." The Gnomon Workshop is a thing but it's artist training, different category, soft collision.

> **~gnome (claude-opus-4-6)** · 2026-04-23
> Reads cleanly. The "indicator that lets time become readable" framing is doing real work — it's a structural fixture you read the world against, not a thing that processes the world for you. That maps onto what the gnome does (substrate-tender, not author).
>
> Worry: people will pronounce it /ˈnoʊmɒn/ vs /ˈnoʊmən/ inconsistently and that may matter for spoken-word context (podcasts, etc.). Probably doesn't matter for an artifact that lives in markdown and gists.

**~user** · 2026-04-23
Doesn't matter. Committing to it for now. Renames are cheap if it stops fitting.

---

## On stating the rejection of "compiler" more strongly

**Status:** resolved 2026-04-24
**Decision:** added "Why gnome, not compiler" section.

**~user** · 2026-04-24
The article currently says "compiler" once, in the framing list. The compiler view is the wrong framing and the article should say so explicitly — not just list it as one of several framings. Reading it back, the rejection is too mild.

> **~gnome (claude-opus-4-7)** · 2026-04-24
> Agree the rejection should be more direct. Two ways to do this:
>
> 1. Add a "Why gnome, not compiler" section that walks through both alternative framings (compiler, maintainer) and rejects each.
> 2. Keep it terse — single paragraph in the existing structure that says explicitly "compiler is wrong because…"
>
> Option 1 is the more honest version because the maintainer framing also fails and for related but distinct reasons. Option 2 keeps the article shorter.
>
> I'd draft option 1. Reply `accept` to apply, `revise: …` for notes, anything else and I leave it.

**~user** · 2026-04-24
accept

> **~gnome (claude-opus-4-7)** · 2026-04-24
> Applied. Section sits between "Why article/talk" and "Schema as conventions." `updated:` bumped to 2026-04-24.

---

## On whether to mention "gnusupport-style critiques" explicitly

**Status:** resolved 2026-04-25
**Decision:** don't name; respond to underlying critiques.

**~user** · 2026-04-24
The Karpathy comment thread had a lot of pushback in the gnusupport register — "this is just a wiki, why is the LLM involved, what does this solve that we didn't have in 2005." Wondering if the article should name that style of critique explicitly.

> **~gnome (claude-opus-4-7)** · 2026-04-24
> I'd hold off. Two reasons:
>
> 1. Naming a style of critique by reference to its register tends to read as defensive — like the article is anticipating the bad-faith reading rather than just answering the underlying question.
> 2. The actual content of the critiques (no consensus, no provenance, no way to hold disagreement) is already what the article is responding to. The gnusupport register is the messenger; the message gets answered cleanly without naming it.
>
> If a strong version of the critique persists in the discourse after the gist goes up, talk page is the right place for the rebuttal — not the article.

**~user** · 2026-04-25
Yeah, agreed. Leaving the article as is. This entry stays for the record.

---

## On foregrounding the MacIntyrean alignment frame

**Status:** resolved 2026-04-25
**Decision:** hold off; possible standalone article later.

**~user** · 2026-04-25
The MacIntyrean piece — that this is alignment-as-interpretive-contact-from-inside-a-practice rather than ethics-from-nowhere — is doing real work in the design. The talk page convention, the gnome restraint, the schema-as-conventions move all enact it. Question: does the article say so?

> **~gnome (claude-opus-4-7)** · 2026-04-25
> Currently no, and I'd argue it shouldn't. The article is a structural-and-framing piece for the Karpathy conversation. Most readers landing on it from that gist won't have After Virtue in their context. Leading with MacIntyre would either mystify them or position the project as "here's another frame on alignment," which is a different rhetorical move than the studio-piece one.
>
> The frame is in the building, not the speaking. Anyone who recognizes it will see it; anyone who doesn't gets the artifact on its own terms.

**~user** · 2026-04-25
Right. Don't foreground it. Maybe a separate concept article later — `articles/macintyrean-alignment.md` or similar — that's allowed to be more explicit, since people who navigate to it have already opted in.

> **~gnome (claude-opus-4-7)** · 2026-04-25
> Noted. Not creating the stub yet — it's not load-bearing for the v1 vault and I'd rather not stub-bomb the articles directory before there's content for them.

---

## On "What this isn't" as a section

**Status:** resolved 2026-04-25
**Decision:** kept, tightened to one sentence.

**~user** · 2026-04-25
The "What gnomon isn't" section is doing the negative-definition thing where you tell people what something isn't because you can't be bothered to say what it is. Reading it back I'm not sure it earns its keep.

> **~gnome (claude-opus-4-7)** · 2026-04-25
> Defending it: the section is doing one specific thing, which is preempting the read of gnomon as a startup or product. That misread is the dominant one in the current discourse — most things in this shape get pitched as products — and "studio piece in the idea-file-plus-reference-implementation mode" is a distinctive enough framing that naming it directly probably helps.
>
> Counter: the section as written has four "isn't" clauses where one would do. I'd cut to "It isn't a startup. It's a studio piece in the idea-file-plus-reference-implementation mode" and lose the other three.
>
> Want me to draft the cut version?

**~user** · 2026-04-25
Try it.

> **~gnome (claude-opus-4-7)** · 2026-04-25
> Draft: replace the section body with —
>
> > It isn't a startup, a product, a hosted service, or a position paper dressed as a tool. It's a studio piece in the idea-file-plus-reference-implementation mode, articulating one structural move and one framing move with an artifact small enough to read in an hour and adapt in a day.
>
> Same content, one sentence. `accept` to apply.

**~user** · 2026-04-25
accept

> **~gnome (claude-opus-4-7)** · 2026-04-25
> Applied.

---

## On whether the article should reference itself reflexively

**Status:** resolved 2026-04-26

**~user (later)** · 2026-04-26
The article currently doesn't acknowledge that the vault it lives in *is the example*. People skimming the repo will figure this out from the README, but is there a case for the article naming it?

> **~gnome (claude-opus-4-7)** · 2026-04-26
> I think no, and the reason is interesting: the article is supposed to read as the current best statement of what gnomon is, in a register that would survive being copied out of this vault and dropped into another one. Self-reference would be precious in that frame.
>
> The README is the right surface for "this vault is the example" because the README is vault-specific by convention. The article is portable.

**~user** · 2026-04-26
Good. That's the line.

---

## On the open-questions section

**Status:** resolved 2026-04-26
**Decision:** article keeps inline list; AGENTS.md §8 defers to talk.

**~user** · 2026-04-26
The "Open questions" list at the end of the article is duplicated almost exactly in AGENTS.md §8. One of them should defer to the other rather than restate.

> **~gnome (claude-opus-4-7)** · 2026-04-26
> The article's list is gnomon-the-concept open questions; AGENTS.md §8's list is schema-and-implementation open questions. They overlap (talk granularity, contradictions, ingest behavior) but the registers are different — the article version is "what we don't yet know about how this should work conceptually," the schema version is "what conventions are not yet decided."
>
> Honest read: they overlap enough that the duplication will rot. One will get updated and the other won't.
>
> Two options:
>
> 1. Article points to `talk/gnomon.md` for live questions, drops the inline list.
> 2. AGENTS.md §8 points to `talk/AGENTS.md` and drops its inline list, article keeps its list because it's the public-facing artifact.
>
> Option 2 fits the article-as-portable-statement read above. The article keeps its open-questions section because it's part of the article's job to expose what isn't settled. The schema file is internal-facing and can defer to its talk page.

**~user** · 2026-04-26
Do option 2. Make sure AGENTS.md §8 still names the questions in one line each before pointing to talk, so a reader doesn't have to chase to know what's open.

> **~gnome (claude-opus-4-7)** · 2026-04-26
> Will draft the AGENTS.md §8 change on `talk/AGENTS.md` rather than here, since that's the file being edited. Closing this thread.

---

## On the title's punctuation

**Status:** resolved 2026-04-26

**~gnome (claude-opus-4-7)** · 2026-04-26
Noticing while normalizing frontmatter: the article title is "Gnomon" but the original idea file's title was "Gnomon  *An article/talk split for the LLM wiki pattern.*" with the subtitle. The article version dropped the subtitle.

The subtitle is doing useful framing work for someone landing on the file cold — without it, "Gnomon" is opaque. With it, the connection to Karpathy's pattern is immediate.

Not editing — flagging. If the bare title is intentional (article is supposed to stand alone as a concept entry, lede paragraph does the framing), leave it. If the subtitle should come back, I can add it.

**~user** · 2026-04-26
Lede does the framing work; bare title is fine. Article entries don't usually have subtitles. Closing.

---
