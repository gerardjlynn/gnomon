---
title: Context as code
type: concept
status: stub
created: '2026-07-03'
updated: '2026-07-03'
related:
  - gnomon
  - wiki-gnome
  - karpathy-llm-wiki
---
The line between context and code is very thin — thin enough that gnomon's machinery already straddles it without having been designed to.

A frozen procedure article is executable: the interpreter is the model. AGENTS.md already works this way — a document that behaves like code because a gnome reads and follows it. Push one step further and the mapping falls out clean: article = source, flux draft = code under review, talk = the review thread, freeze = the deploy gate, revert = rollback. Under this reading gnomon is not version control for knowledge; it is version control for behavior.

Consequences this framing makes visible: a work plan is a vault object (drafted in flux, deliberated on talk, frozen when committed to; an agent executes the *frozen* plan and posts run observations back to talk). Orchestration engines (LangGraph et al.) become replaceable executors beneath a vault-governed plan layer — their human-in-the-loop interrupt maps 1:1 to the freeze gate, but their opaque checkpoint stores duplicate what git already provides. And agent actions with external effects inherit the commitment question: they need the freeze gate in front of them or an explicit revertibility story, because effects, unlike commits, don't revert for free.

