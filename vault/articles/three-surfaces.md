---
title: Three surfaces and live drafts
type: concept
status: stub
created: '2026-05-30'
updated: '2026-05-30'
related:
  - gnomon
  - article-talk-split
  - wiki-gnome
---

# Three surfaces and live drafts

Gnomon now has three surfaces where work happens, with different capabilities and different roles. Naming the split makes it possible to decide what belongs where instead of letting friction drive the answer.

## The three surfaces

**The gnome (Claude Desktop).** Substantive research and drafting. Operates *through* the gnomon MCP — `post_to_talk`, `edit_article_*`, the source/article tools. Bounded by the convention: every post is signed `~gnome`, every article-body change goes through the talk-accept-then-PR pipeline. Strong at long-form thinking; weak at maintaining context across sessions (each Project is a silo, each conversation has a limit).

**The wrench (Claude Code).** Tooling, plumbing, and the convention-can't-fit escape hatch. Has full filesystem and shell access. Builds missing MCP tools when gaps surface, restarts the server, renames files to fit slug conventions, edits the vault directly when something has to happen *outside* the gnome's bounded channel. Not a daily surface — invoked when a loop is broken or a tool is missing.

**The browser (the human).** Reads polished prose from the SSG build. Currently read-only; this article proposes promoting it to a real write surface for talk-page replies, ✓Resolve actions on draft threads, and live-draft article editing (see below).

## The asymmetry the browser fills

The gnomon accept-loop convention assumes a human typing into the vault, separately from the gnome. In practice the human is often inside another LLM session — relaying accept signals through the gnome (which signs them as gnome and so fails the parser) or through the wrench (which signs them properly but routes the human's authorization through a chat tool, not a direct surface).

Either workaround makes the human-acceptance step depend on a Claude being present and correctly briefed. That's a brittle dependency. The browser surface gives the human a direct, durable path: open the talk page, click ✓Resolve, the accept signal lands as a clean `**Status:** resolved <date>` append. No Claude in the loop.

This is the missing surface the convention already implies should exist — the human's daily-driver path into the vault, distinct from the gnome's drafting path and the wrench's plumbing path.

## Live drafts

The accept-loop is the right shape for *durable* article changes — talk-mediated, PR-gated, audit-scarred. It is the wrong shape for **in-flight** documents (research notes, planning docs, drafts being actively worked on by multiple writers). The talk-accept gate adds friction that pushes those documents back out of the vault and into scattered Claude conversations, which is exactly what gnomon exists to fix.

The proposal: a third article class, `status: live-draft` (or analogous flag), that bypasses talk-accept. All three surfaces can write directly to a live-draft article. When the work is settled, someone flips it to `status: current` and the standard accept-loop conventions apply from that point forward. The talk page during flux holds little — the draft itself is the conversation — and accumulates substantive discussion only once frozen.

This makes the browser a real write surface (without it, live-drafts have no meaningful human-edit path), and turns gnomon into the durable substrate for in-flight as well as settled work.

## Open design questions

- **Where does the freeze line live?** Status flag (cheapest, keeps everything in `articles/`) vs. separate directory (more visible). Leaning status with a "DRAFT — in flux" banner in the SSG render.
- **What does the talk page do for a live draft?** Probably nothing until freezing. Departure from the current "talk is where everything starts" convention.
- **Concurrency.** Three writers on the same markdown file produces git conflicts. Cheapest path: optimistic, let git surface them. More robust: writes queue through the local write server, which holds the lock.
- **Auth.** The browser write server only needs to assert "this came from the localhost session," not Real Auth — the user is the only intended writer through that surface.

This is forward-looking design, not yet built. See talk page for accept/refinement before scope shifts to implementation.
