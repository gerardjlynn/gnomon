/**
 * Vault registry file (`vaults.json`) — the single source of truth for which
 * vaults the MCP server serves.
 *
 * Registration used to live only in launch flags (`--vault name=path`),
 * duplicated across every MCP client config (.mcp.json, ~/.claude.json) and
 * prone to drift. The server now loads this file at startup; flags still work
 * and override it. `register_vault` / `unregister_vault` edit this file so the
 * list has one home that is reviewable and committed.
 *
 * Located relative to this module (repo-root `vaults.json`), so it is found
 * regardless of the launch working directory. Relative vault paths in the file
 * resolve against the repo root; absolute paths are used as-is.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";

export interface VaultRegistration {
  name: string;
  path: string;
}

/** Absolute path to vaults.json (repo root, one level up from mcp/). */
export const CONFIG_PATH = fileURLToPath(new URL("../vaults.json", import.meta.url));
const CONFIG_DIR = dirname(CONFIG_PATH);

interface VaultsFile {
  vaults: Record<string, string>;
}

function readRaw(): VaultsFile {
  if (!existsSync(CONFIG_PATH)) return { vaults: {} };
  const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Partial<VaultsFile>;
  return { vaults: parsed.vaults ?? {} };
}

/**
 * Write the file back, preserving key insertion order. Order is significant:
 * the first-registered vault is the server's default, so this must NOT sort.
 */
function writeRaw(file: VaultsFile): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(file, null, 2) + "\n", "utf-8");
}

/** Registered vaults from vaults.json, in file order, paths resolved absolute. */
export function loadVaultConfig(): VaultRegistration[] {
  return Object.entries(readRaw().vaults).map(([name, p]) => ({
    name,
    path: isAbsolute(p) ? p : resolve(CONFIG_DIR, p),
  }));
}

/** Add or update a vault entry. New names append (never becoming the default). */
export function addVaultToConfig(name: string, path: string): void {
  const file = readRaw();
  file.vaults[name] = path;
  writeRaw(file);
}

/** Remove a vault entry. Returns false if the name was not present. */
export function removeVaultFromConfig(name: string): boolean {
  const file = readRaw();
  if (!(name in file.vaults)) return false;
  delete file.vaults[name];
  writeRaw(file);
  return true;
}
