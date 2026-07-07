/**
 * Git operations for the gnome's substrate.
 *
 * The gnome operates *through* git rather than alongside it: every edit
 * becomes a commit, signed by the gnome's identity. There is one write
 * path — `commitAndSync` — which commits locally and, unless held, syncs
 * with the remote (pull --rebase, then push). This keeps multiple authors
 * converging on one `main`. Append-only talk pages union-merge on overlap
 * (see the vault's `.gitattributes`); a genuine collision on an article
 * body is the one case that stops for a human.
 *
 * Identity is read from env vars GNOMON_GNOME_IDENTITY_NAME /
 * GNOMON_GNOME_IDENTITY_EMAIL. When unset, falls back to the local git
 * user — the placeholder path for single-user prototyping. Swap to a
 * dedicated bot account by setting the env vars.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface GnomeIdentity {
  name: string;
  email: string;
}

/**
 * Outcome of a `commitAndSync`. The commit always lands locally (`sha`);
 * the sync fields describe what happened with the remote.
 *
 * - `pushed`: the commit reached origin/main.
 * - `pulledChanges`: the rebase brought in commits from other authors.
 * - `conflict`: a non-union file (i.e. an article body) collided with the
 *   remote and could not auto-merge. The rebase was aborted, the working
 *   tree is clean, and the local commit survives unpushed — a human needs
 *   to reconcile.
 * - `pushError`: the remote was unreachable or rejected the push for a
 *   reason other than a content conflict (e.g. no remote configured). The
 *   commit is safe locally.
 */
export interface CommitResult {
  sha: string;
  pushed: boolean;
  pulledChanges: boolean;
  conflict?: { files: string[] };
  pushError?: string;
}

export class GitOps {
  constructor(
    public readonly vaultPath: string,
    public readonly identity: GnomeIdentity,
  ) {}

  /**
   * Stage the named files, commit with the gnome identity, and (unless
   * `push` is false) sync with origin/main: fetch, rebase the local commit
   * onto the remote tip, push.
   *
   * Identity is applied per-command via `git -c user.name=...` rather than
   * mutating local git config — leaves the human's normal git setup alone.
   *
   * `push: false` holds the change: it commits locally and does not touch
   * the remote. Never throws on a sync problem — the commit is preserved
   * and the trouble is reported in the returned {@link CommitResult}.
   */
  async commitAndSync(opts: {
    message: string;
    files: string[];
    push?: boolean;
  }): Promise<CommitResult> {
    if (opts.files.length === 0) {
      throw new Error("commitAndSync: no files to stage");
    }
    await this.git(["add", ...opts.files]);
    await this.git([
      "-c", `user.name=${this.identity.name}`,
      "-c", `user.email=${this.identity.email}`,
      "commit", "-m", opts.message,
    ]);
    const sha = (await this.git(["rev-parse", "HEAD"])).trim();

    // Held: commit stays local, remote untouched.
    if (opts.push === false) {
      return { sha, pushed: false, pulledChanges: false };
    }

    try {
      await this.git(["fetch", "origin"]).catch(() => undefined);
      const remoteRef = (
        await this.git(["rev-parse", "--verify", "--quiet", "origin/main"]).catch(() => "")
      ).trim();

      let pulledChanges = false;
      if (remoteRef) {
        // Only rebase when we are genuinely behind — i.e. origin/main is NOT
        // already contained in HEAD. When we're ahead-only or up-to-date the
        // push fast-forwards, and we skip rebase entirely (rebase refuses to
        // run on a dirty tree, so rebasing needlessly turns unrelated
        // uncommitted edits into a spurious "conflict").
        const behind = await this.git(["merge-base", "--is-ancestor", "origin/main", "HEAD"])
          .then(() => false)
          .catch(() => true);
        if (behind) {
          try {
            // --autostash: unrelated uncommitted edits in a shared working
            // tree are stashed and reapplied around the rebase, so they don't
            // block it. Talk pages union-merge (see .gitattributes); only an
            // article-body collision produces real unmerged files.
            await this.git(["rebase", "--autostash", "origin/main"]);
          } catch {
            const files = await this.conflictedFiles().catch(() => []);
            await this.git(["rebase", "--abort"]).catch(() => undefined);
            if (files.length > 0) {
              return { sha, pushed: false, pulledChanges: false, conflict: { files } };
            }
            // Rebase failed for a non-content reason. Commit is safe locally.
            return {
              sha,
              pushed: false,
              pulledChanges: false,
              pushError: "rebase could not complete (no content conflict); reconcile by hand",
            };
          }
          pulledChanges = true;
        }
      }
      await this.git(["push", "origin", "main"]);
      return { sha, pushed: true, pulledChanges };
    } catch (e) {
      // Remote unreachable / no upstream / push rejected for a non-content
      // reason. The commit is safe locally.
      return {
        sha,
        pushed: false,
        pulledChanges: false,
        pushError: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** Files left in an unmerged (conflicted) state, e.g. mid-rebase. */
  private async conflictedFiles(): Promise<string[]> {
    const out = await this.git(["diff", "--name-only", "--diff-filter=U"]);
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  private async git(args: string[]): Promise<string> {
    return this.run("git", args);
  }

  private async run(cmd: string, args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileP(cmd, args, {
      cwd: this.vaultPath,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (stderr && process.env.GNOMON_DEBUG) {
      console.error(`[${cmd} ${args.join(" ")}] stderr:`, stderr);
    }
    return stdout;
  }
}

/**
 * Resolve the identity the gnome should use for commits.
 *
 *   1. Env vars GNOMON_GNOME_IDENTITY_NAME / GNOMON_GNOME_IDENTITY_EMAIL
 *      override everything. Set these to swap to a dedicated bot identity.
 *   2. Otherwise fall back to the local git user (fine for single-user;
 *      swap before multi-author if you want commits attributed to a bot).
 */
export async function loadGnomeIdentity(vaultPath: string): Promise<GnomeIdentity> {
  const name = process.env.GNOMON_GNOME_IDENTITY_NAME;
  const email = process.env.GNOMON_GNOME_IDENTITY_EMAIL;
  if (name && email) return { name, email };
  const nameOut = await execFileP("git", ["-C", vaultPath, "config", "user.name"]);
  const emailOut = await execFileP("git", ["-C", vaultPath, "config", "user.email"]);
  return {
    name: nameOut.stdout.trim(),
    email: emailOut.stdout.trim(),
  };
}
