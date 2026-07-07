/**
 * gnomon portal — every registered vault, one site.
 *
 * Reads the vault registry from vaults.json (the same registry the MCP
 * server serves, via `mcp/config.ts`), builds each vault's reader into
 * `<out>/<name>/`, and writes a hub index.html linking them. Register a
 * vault once and it appears here on the next build — no per-vault flags.
 *
 *   tsx site/portal.ts [--out <dir>]     # default out: <repo>/_portal
 *
 * The out dir is removed and rebuilt from scratch so stale vaults (or the
 * old build.ts portal layout) never linger.
 */
import { readFile, writeFile, mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVaultConfig, CONFIG_PATH } from "../mcp/config.js";
import { buildReader } from "./reader.js";

interface HubEntry {
  name: string;
  title: string;
  tagline: string;
  pageCount: number;
}

/** Per-vault display metadata from `<vault>/site.json`, with fallbacks. */
async function readSiteMeta(
  vaultPath: string,
  name: string,
): Promise<{ title: string; tagline: string }> {
  const p = join(vaultPath, "site.json");
  const fallback = { title: name.charAt(0).toUpperCase() + name.slice(1), tagline: "" };
  if (!existsSync(p)) return fallback;
  try {
    const j = JSON.parse(await readFile(p, "utf-8"));
    return {
      title: typeof j.title === "string" ? j.title : fallback.title,
      tagline: typeof j.tagline === "string" ? j.tagline : "",
    };
  } catch {
    return fallback;
  }
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHub(entries: HubEntry[], fontsCss: string): string {
  const items = entries
    .map(
      (e) => `      <a class="vault" href="${escape(e.name)}/">
        <span class="vault-title">${escape(e.title)}</span>
        <span class="vault-tagline">${escape(e.tagline)}</span>
        <span class="vault-count">${e.pageCount} page${e.pageCount === 1 ? "" : "s"}</span>
      </a>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>gnomon — vaults</title>
<style>
${fontsCss}
:root { --bg: #faf9f6; --ink: #1c1b18; --muted: #6f6a5f; --line: #e4e1d8; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #191817; --ink: #e8e5de; --muted: #98928a; --line: #33312d; }
}
* { box-sizing: border-box; margin: 0; }
body {
  background: var(--bg); color: var(--ink);
  font-family: "Newsreader", Georgia, serif;
  max-width: 40rem; margin: 0 auto; padding: 4rem 1.5rem;
}
h1 { font-weight: 500; font-size: 1.6rem; margin-bottom: .3rem; }
p.sub { color: var(--muted); margin-bottom: 2.5rem; font-style: italic; }
.vault {
  display: block; padding: 1.1rem 0; border-top: 1px solid var(--line);
  color: inherit; text-decoration: none;
}
.vault:last-of-type { border-bottom: 1px solid var(--line); }
.vault:hover .vault-title { text-decoration: underline; }
.vault-title { font-size: 1.15rem; display: block; }
.vault-tagline { color: var(--muted); display: block; margin-top: .15rem; }
.vault-count { color: var(--muted); font-size: .85rem; display: block; margin-top: .3rem; }
</style>
</head>
<body>
  <h1>gnomon</h1>
  <p class="sub">every registered vault</p>
${items}
</body>
</html>
`;
}

async function main() {
  const args = process.argv.slice(2);
  let outRoot = fileURLToPath(new URL("../_portal", import.meta.url));
  const outIdx = args.indexOf("--out");
  if (outIdx !== -1) outRoot = resolve(args[outIdx + 1] ?? "_portal");

  const registrations = loadVaultConfig();
  if (registrations.length === 0) {
    console.error(`No vaults registered in ${CONFIG_PATH}.`);
    process.exit(1);
  }

  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });

  const entries: HubEntry[] = [];
  for (const { name, path } of registrations) {
    const pageCount = await buildReader(path, join(outRoot, name), name, "../");
    const meta = await readSiteMeta(path, name);
    entries.push({ name, ...meta, pageCount });
  }

  // Hub reuses the reader's vendored fonts (same no-fetch-at-render rule).
  const assetsDir = fileURLToPath(new URL("./assets", import.meta.url));
  const fontsCss = await readFile(join(assetsDir, "fonts.css"), "utf-8");
  const fontsSrc = join(assetsDir, "fonts");
  const fontsOut = join(outRoot, "assets", "fonts");
  await mkdir(fontsOut, { recursive: true });
  for (const f of await readdir(fontsSrc)) {
    if (f.endsWith(".woff2")) await copyFile(join(fontsSrc, f), join(fontsOut, f));
  }

  await writeFile(join(outRoot, "index.html"), renderHub(entries, fontsCss), "utf-8");
  console.log(`portal: ${entries.length} vaults → ${join(outRoot, "index.html")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
