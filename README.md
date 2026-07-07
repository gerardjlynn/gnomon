# Gnomon

*An article/talk split for the LLM wiki pattern.*

A small structural addition to [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/) and a particular way of framing what the LLM is doing in it. The addition is the **article/talk split** that Wikipedia has had since the early 2000s: every article has a paired talk page. The framing is that the LLM works as a **wiki gnome** — substrate-tender, not author or compiler.

The load-bearing case is the one where multiple people and multiple LLM agents work on the same body of thinking and it has to stay legible across actors and time — who said what, what's settled, where the disagreement lives. Single-author note-taking is the easy case; gnomon is calibrated for the hard one. Said plainly: the example vault in this repo has so far had one human and one gnome in it. The multi-actor case is what the conventions are built for, and what the talk pages demonstrate in miniature — two kinds of author disagreeing, deciding, and leaving the trail — but it hasn't yet carried a full team, and that test matters.

For the full statement, read `vault/articles/gnomon.md`. The conventions are in `vault/AGENTS.md`. This README orients someone arriving cold; everything substantive lives in those two files.

## The idea in one paragraph

An article holds the **current best statement** of something. Its paired talk page holds the **working-out** — disputes, drafts, decisions, signed and dated. The two are different kinds of writing and they get different treatment: articles are the settled corpus and stay small and trustworthy; talk is where volume accumulates. The LLM tends the structure (typos, links, frontmatter), surfaces issues on talk, and drafts on talk before any substantive edit — but it does not author articles, resolve disputes, or flatten the tensions the talk pages exist to hold. That restraint is the whole point: it keeps the settled corpus something a human was willing to sign, even as the agents generate faster than anyone can read.

## What's in here

This repo is **the tool plus a small example vault** — the vault content here is a working demonstration of gnomon documenting itself.

- **`vault/articles/`** — the example vault's articles. Concept articles and source articles, all in one flat namespace. Type is in frontmatter, not in the path.
- **`vault/talk/`** — paired talk pages, same basenames as the articles. Real working pages: disputes, drafts, decisions about what's settled.
- **`vault/sources/`** — raw external material referenced by source-type articles.
- **`vault/AGENTS.md`** — the schema. Read by Claude Code, Cursor, Aider, and any agent that follows the `AGENTS.md` convention. The LLM operating against the vault reads this file and follows its conventions. §4 is the gnome's operational checklist and is load-bearing.
- **`mcp/`** — MCP server (TypeScript). Vault operations grouped by what they touch: reading, originating, editing along a graduated model (janitorial → bold → authorial), posting to talk, librarian operations (compaction, sampling-as-audit, on-demand navigation), plus lint. One server can serve several vaults via repeated `--vault name=path`.
- **`site/`** — static site generator. Renders the vault to browseable HTML where each page shows the article *and* its talk page together — which is what makes the structural commitment visible.

## Running

Requires Node 20+.

```sh
npm install
npm run lint           # lint the example vault
npm run site           # build the static site into vault/_site/
npm run site:serve     # build and serve at localhost:8000
npm run mcp            # start the MCP server (stdio) against the bundled vault
```

To use the MCP server with Claude Desktop or Claude Code, register it against a vault:

```json
{
  "mcpServers": {
    "gnomon": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/gnomon/mcp/server.ts", "--vault", "gnomon=/path/to/your/vault"]
    }
  }
}
```

The vault path can be this repo's `vault/` (to operate against the example content) or any other directory laid out per `AGENTS.md`. Point `--vault` at as many vaults as you like.

## Reading order

If you're new and have ten minutes:

1. `vault/articles/gnomon.md` — what gnomon is
2. `vault/articles/article-talk-split.md` — the structural commitment
3. `vault/articles/wiki-gnome.md` — the LLM's role inside the split
4. `vault/talk/gnomon.md` — what a talk page actually looks like in use

If you have an hour:

5. `vault/AGENTS.md` — the full schema, in particular §4 (the gnome's operational checklist)
6. `vault/articles/karpathy-llm-wiki.md` — what gnomon takes from and adds to Karpathy's pattern
7. `mcp/server.ts` — the MCP operations

## Adapting

The whole thing is meant to be copied and adapted. Keep `AGENTS.md` and the `articles/` + `talk/` + `sources/` layout; replace the example content with your own; point the MCP at the new vault. Different vaults can carry different schemas — edit `AGENTS.md` to match what your vault actually needs. Conventions, not ontology.

## What this is and isn't

It isn't a startup, a product, a hosted service, or a position paper dressed as a tool. It's a studio piece in the idea-file-plus-reference-implementation mode, articulating one structural move and one framing move with an artifact small enough to read in an hour and adapt in a day.

The project enters Karpathy's conversation rather than opening a new one.

## License

MIT. Take it, adapt it, run it. If you find something useful or notice something wrong, the talk pages are where that goes.
