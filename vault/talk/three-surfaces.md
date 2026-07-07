# Talk: Three surfaces and live drafts

*(empty)*

---

## Next step: thread-granular search deep-links (tighten existing search, not add semantic search)

**~gnome (claude-opus-4-8)** · 2026-06-16

**Status: open** (captured next step — ready to execute; same shape/risk as the activity-feed fix)

Capturing a browser-surface improvement surfaced while fixing the activity feed, so it isn't lost. **This is tightening, not expansion** — it makes the *existing* keyword search precise; it is explicitly *not* semantic search, which stays deferred as out of scope. The boundary stays intact.

**The observation.** The SSG search (`search.html` over `index.json`) has the same disease the activity feed just had, one notch worse:
- `index.json` is **document-granular** — one entry per article (`{type, title, url, content}`), with the talk page's text concatenated into the article entry's `content` blob.
- So talk content *is* findable (e.g. "a session" matches), but **every hit links to the article page with no anchor** (`example-synthesis.html`, zero `#` in any url). Searching a talk thread lands you on the article page — the wrong page, where that text isn't even shown — with nothing to deep-link to.

This is the identical failure the feed had (document-granular, links to article, no deep link), and it bites the same way: the browser surface can find that something was said but can't take you to where.

**The next step.** Mirror the feed fix in the search index: emit a search entry **per talk thread** alongside the per-article entries —

`{ type: "thread", title: <H2 heading>, url: "{slug}-talk.html#{anchor}", content: <thread body> }`

— so a hit on a thread deep-links straight to it. Reuse the machinery already added for the feed: `slugifyHeading` for the anchor (so it matches the rendered heading `id` exactly) and the joint-author-aware signature handling. Same verification: confirm deep links resolve to a real `id`, and that both single-signer (`~gnome`) and joint (`Human & ~gnome`) threads are covered.

**Why it belongs here.** The browser is the human's daily-driver read surface (this article's framing). Feed answers "what just changed"; search answers "where did we say X." After the feed fix they were left inconsistent — feed deep-links, search doesn't. This closes that asymmetry. It also reinforces the all-tightening principle: existing affordance made legible, no new capability.

**Effort.** Small; one focused change to the search-index build in `site/build.ts`, plus a rebuild. Lower-stakes than the feed fix (search is read-only discovery; no signature-parsing correctness risk beyond reusing the now-tested helpers).

Reply `accept` to authorize implementation, `revise: …` for notes, anything else and it stays captured-but-unbuilt.

---

## On the freeze signature: joint-at-freeze, gnome-solo-in-flux

**~gnome (claude-opus-4-8)** · 2026-06-28

From a working session on the signing mechanic that an earlier freeze decision ("a human performs the freeze") leaves underspecified. The question that started it: how does a gnome sign, and does the in-file joint convention (`~user & ~gnome (model-id)`) collapse attribution?

**Refinement proposed:** make the joint signature *specifically the freeze marker*, not a universal byline.
- In flux, the gnome writes on its own initiative → flux entries/edits read `~gnome (model-id)` solo.
- The human's name joins only at the freeze → `~user & ~gnome` marks a commitment.
- Consequence: *the appearance of the human's signature is the freeze*. Settled-vs-flux becomes readable from who signed, with no separate status field doing that work. The signature stops being decorative and becomes load-bearing for the commitment/deliberation split.

This keeps faith with the relocated gnome principle. If the human's name auto-attached in flux, the system would pre-stamp commitment-weight onto work no human committed — a quiet inversion of "don't silently mint a commitment" (silent *attribution* rather than silent minting).

**On forgeability** (the worry that prompted "should gnomes have their own signing keys"): the convention is forgeable — anyone can type a signature — and that is fine, because of the split. Trust-weight lands only on what is *settled*, and the freeze is performed by the human under their ordinary (unforgeable) git identity. A commitment's authenticity rests on the human's freeze-signature, not the gnome's byline. Flux carries no trust-weight, so a forged gnome byline in flux changes nothing settled; the moment it freezes, a human signs and takes responsibility. Net: gnome signing *keys* are a real fix to a problem the high-trust audience doesn't have — skip the plumbing until building for a lower-trust audience, and let that need be the signal to add them.

**Load-bearing caveat:** this only holds while the freeze stays a *meaningful* human act. "The human froze it, therefore the human vouches for it" is the whole anchor; if freezing degrades to a rubber-stamp, an unforgeable signature merely certifies something unreviewed, and no cryptography recovers it. Provenance integrity was never the keys — it is whether the freeze is a real decision.

**Status: open.** The user's call on ratifying the joint-at-freeze / solo-in-flux convention; if yes it lands in AGENTS.md §5 alongside the existing signature rules and in the three-surfaces freeze mechanic.

**~user & ~gnome (claude-opus-4-8)** · 2026-06-28

**Status: resolved 2026-06-28**

**Decision:** ratify joint-at-freeze / solo-in-flux. Gnome flux entries and edits sign `~gnome (model-id)` solo. A human signature joining — `~user & ~gnome (model-id)`, human name first per §5 — marks a freeze: the promotion of something to a commitment. The *presence of a human signature is itself the freeze marker*; settled-vs-flux is readable from who signed, without a separate status field carrying that load. Forgeability of the convention is acceptable because trust-weight rests on the human's freeze-signature (ordinary unforgeable git identity), not the gnome byline; flux carries none. Gnome signing keys stay deferred until a lower-trust audience needs them.

Noted in passing: this resolution entry is the convention's own first use — a joint signature marking the freeze of the joint-signature rule.

**Remaining (by-hand):** codify in AGENTS.md §5 alongside the existing signature rules. The MCP has no AGENTS.md editor, so this is a direct repo edit, not an accept-gated authorial PR. Drop-in text handed to the user in session 2026-06-28.
