/**
 * Branch catalog (ADR-0031). A `branch` belongs to a repo (software → projects →
 * repos → branches) and carries its classification (kind + environment) and its
 * derivation parent (`base`) so a GitHub-style branch graph can be drawn.
 * Keyed by (project, repo, name).
 */

import { z } from "zod";
import type { BranchEnv, BranchKind } from "../util/branches.js";

const now = () => new Date();

export const BRANCH_KINDS = ["main", "master", "develop", "staging", "release", "hotfix", "feature", "other"] as const;
export const BRANCH_ENVS = ["prod", "staging", "dev", "none"] as const;

export const BranchRecordSchema = z.object({
  project: z.string(),
  repo: z.string(), // owning repo name
  name: z.string(), // branch name
  kind: z.enum(BRANCH_KINDS).default("other"),
  environment: z.enum(BRANCH_ENVS).default("none"),
  /** The branch this one derives from (null for trunks like main/develop). */
  base: z.string().nullable().default(null),
  protectedBranch: z.boolean().default(false),
  head_sha: z.string().nullable().default(null),
  remote: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.date().default(now),
  updated_at: z.date().default(now),
});
export type BranchRecord = z.infer<typeof BranchRecordSchema>;

export const makeBranchRecord = (v: z.input<typeof BranchRecordSchema>): BranchRecord => BranchRecordSchema.parse(v);

export const BRANCHES_COLLECTION = "branches";

// Re-export the classifier types for convenience.
export type { BranchEnv, BranchKind };
