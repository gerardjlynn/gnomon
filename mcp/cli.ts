#!/usr/bin/env node
/**
 * CLI for running gnomon operations directly (not via MCP). Mostly
 * useful for `npm run lint` in CI or local checks.
 *
 * Usage:
 *   tsx mcp/cli.ts lint [vault-path]
 *   tsx mcp/cli.ts search "<query>" [vault-path]
 *   tsx mcp/cli.ts new-vault <name> [vault-path]
 *   tsx mcp/cli.ts unregister-vault <name>
 *
 * Default vault path is the current directory.
 */

import { resolve, dirname, join } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Vault } from "./vault.js";
import { lint, formatFindings } from "./lint.js";
import { searchVaultSemantic } from "./semantic.js";
import {
  addVaultToConfig,
  removeVaultFromConfig,
  loadVaultConfig,
  CONFIG_PATH,
} from "./config.js";

async function main() {
  const command = process.argv[2];

  if (command === "lint") {
    const vaultPath = resolve(process.argv[3] ?? ".");
    const vault = new Vault(vaultPath);
    const findings = await lint(vault);
    console.log(formatFindings(findings));
    // Exit non-zero if there are any errors (per severity).
    const hasErrors = findings.some((f) => f.severity === "error");
    process.exit(hasErrors ? 1 : 0);
  } else if (command === "search") {
    const query = process.argv[3];
    const vaultPath = resolve(process.argv[4] ?? ".");
    if (!query) {
      console.error('Usage: tsx mcp/cli.ts search "<query>" [vault-path]');
      process.exit(2);
    }
    const hits = await searchVaultSemantic(vaultPath, query, 8);
    if (hits.length === 0) {
      console.log(`No matches for "${query}".`);
      return;
    }
    for (const h of hits) {
      console.log(`${h.score.toFixed(3)}  ${h.slug} [${h.side}] · ${h.heading}`);
      console.log(`        ${h.snippet}`);
      console.log(`        ${h.path}`);
    }
  } else if (command === "new-vault") {
    const name = process.argv[3];
    if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
      console.error(
        "Usage: tsx mcp/cli.ts new-vault <name> [vault-path]\n" +
          "  <name> is the registry key: lowercase, alphanumeric + hyphens, starting with a letter.",
      );
      process.exit(2);
    }
    const registered = new Map(loadVaultConfig().map((r) => [r.name, r.path]));
    if (registered.has(name)) {
      console.error(`Vault '${name}' is already registered → ${registered.get(name)}`);
      process.exit(1);
    }
    // Default path follows the sibling convention: a `<name>/vault` project
    // dir next to the gnomon repo (CONFIG_PATH lives at the repo root).
    const repoRoot = dirname(CONFIG_PATH);
    const vaultPath = process.argv[4]
      ? resolve(process.argv[4])
      : resolve(repoRoot, "..", name, "vault");

    // Scaffold the standard layout (articles/, talk/, sources/, .gitattributes).
    // Reuses the same routine the server runs on every vault at startup.
    await new Vault(vaultPath).ensureLayout();

    // site.json — title-cased name, placeholder tagline. Left alone if present.
    const siteJson = join(vaultPath, "site.json");
    if (!existsSync(siteJson)) {
      const title = name
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      writeFileSync(
        siteJson,
        JSON.stringify({ title, tagline: "A new gnomon vault." }, null, 2) + "\n",
      );
    }

    // .gitignore — build artifacts and Finder cruft. Left alone if present.
    const gitignore = join(vaultPath, ".gitignore");
    if (!existsSync(gitignore)) {
      writeFileSync(
        gitignore,
        [".DS_Store", ".gnomon/", "_site/", "_portal/", "_reader/", ".obsidian/", "*.zip"].join(
          "\n",
        ) + "\n",
      );
    }

    // git init on `main` (GitOps commits/pushes there). Idempotent: an existing
    // repo is left untouched.
    const alreadyRepo = existsSync(join(vaultPath, ".git"));
    if (!alreadyRepo) {
      execFileSync("git", ["init", "-b", "main", vaultPath], { stdio: "ignore" });
    }

    // Register in vaults.json — appends, so it never displaces the default.
    addVaultToConfig(name, vaultPath);

    console.log(`Vault '${name}' created and registered.`);
    console.log(`  path:     ${vaultPath}`);
    console.log(`  registry: ${CONFIG_PATH}`);
    if (alreadyRepo) console.log("  (existing git repo left as-is)");
    console.log("\nRestart / reconnect the gnomon MCP server to start serving it.");
    console.log("No remote is configured — drive writes with push:false until you add one.");
  } else if (command === "unregister-vault") {
    const name = process.argv[3];
    if (!name) {
      console.error("Usage: tsx mcp/cli.ts unregister-vault <name>");
      process.exit(2);
    }
    if (!removeVaultFromConfig(name)) {
      console.error(`No vault named '${name}' in the registry.`);
      process.exit(1);
    }
    console.log(`Unregistered '${name}'. Files on disk were left untouched.`);
    console.log("Restart / reconnect the gnomon MCP server to stop serving it.");
  } else {
    console.error(
      'Usage: tsx mcp/cli.ts lint [vault-path]\n' +
        '       tsx mcp/cli.ts search "<query>" [vault-path]\n' +
        "       tsx mcp/cli.ts new-vault <name> [vault-path]\n" +
        "       tsx mcp/cli.ts unregister-vault <name>",
    );
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
