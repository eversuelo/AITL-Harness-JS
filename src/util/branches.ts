/**
 * Branch classification (ADR-0031) — give every git branch a role + environment +
 * a derivation parent, so a GitHub-style branch graph can be drawn.
 *
 * Pure + rule-based: canonical trunks (main/master/develop/staging) are recognized
 * by name; everything else is a feature/release/hotfix/other that *derives from* a
 * base branch (by gitflow convention, refined by git in the sync step).
 */

export type BranchKind =
  | "main"
  | "master"
  | "develop"
  | "staging"
  | "release"
  | "hotfix"
  | "feature"
  | "other";

export type BranchEnv = "prod" | "staging" | "dev" | "none";

export interface BranchClass {
  kind: BranchKind;
  environment: BranchEnv;
  /** Conventional base branch this one derives from (null for trunks). */
  derivesFrom: string | null;
  /** True for long-lived protected trunks (main/master/develop/staging). */
  protected: boolean;
}

const norm = (n: string) => n.replace(/^refs\/heads\//, "").trim();

/**
 * Classify a branch by name. `trunks` are the candidate trunk names that actually
 * exist in the repo (used to pick a sensible `derivesFrom` for non-canonical
 * branches); defaults cover the common gitflow set.
 */
export function classifyBranch(name: string, trunks: string[] = ["develop", "main", "master"]): BranchClass {
  const n = norm(name);
  const lower = n.toLowerCase();
  const has = (t: string) => trunks.map((x) => x.toLowerCase()).includes(t);
  // Preferred base for branches that fork off the integration line.
  const devBase = has("develop") ? "develop" : has("main") ? "main" : has("master") ? "master" : "develop";
  const prodBase = has("main") ? "main" : has("master") ? "master" : "main";

  if (lower === "main") return { kind: "main", environment: "prod", derivesFrom: null, protected: true };
  if (lower === "master") return { kind: "master", environment: "prod", derivesFrom: null, protected: true };
  if (lower === "develop" || lower === "dev") return { kind: "develop", environment: "dev", derivesFrom: null, protected: true };
  if (lower === "staging" || lower === "stage" || lower === "qa") return { kind: "staging", environment: "staging", derivesFrom: devBase, protected: true };

  const prefix = lower.split("/")[0];
  if (prefix === "release" || prefix === "rc") return { kind: "release", environment: "staging", derivesFrom: devBase, protected: false };
  if (prefix === "hotfix" || prefix === "fix") return { kind: "hotfix", environment: "prod", derivesFrom: prodBase, protected: false };
  if (prefix === "feature" || prefix === "feat" || prefix === "chore" || prefix === "bugfix")
    return { kind: "feature", environment: "none", derivesFrom: devBase, protected: false };

  // Unknown → derives from the integration trunk.
  return { kind: "other", environment: "none", derivesFrom: devBase, protected: false };
}
