/**
 * Read helpers for the append-only revision history (ADR-0027).
 *
 * Reconstructs the full version chain of an ADR or memory doc: the archived
 * snapshots from `*_history` (oldest first) followed by the current live doc as
 * the newest version. Used by the CLI `history` commands (and reusable by the API).
 *
 * Post-Mongoose migration this reads through the models: `kind` picks the live model
 * (decisions→DecisionModel / memory→MemoryModel) and its natural key, and the matching
 * history model (decisions_history→DecisionHistoryModel / memory_history→MemoryHistoryModel).
 */

import type { Model } from "mongoose";
import { DecisionModel } from "../models/decision.model.js";
import { modelFor as historyModelFor } from "../models/history.model.js";
import { MemoryModel } from "../models/memory.model.js";
import { ensureMongoose } from "../db/mongoose.js";

export type HistoryKind = "decision" | "memory";

export interface VersionEntry {
  version: number;
  doc: Record<string, unknown>;
  /** true for the current (live) version, false for an archived snapshot. */
  live: boolean;
  archived_at?: Date;
  actor_id?: string;
  actor_role?: string;
  branch?: string | null;
}

// Live model widened to `Model<any>` so the two distinct model generics resolve against a
// single call signature; `key` is the natural id used to query the live doc.
const CONFIG: Record<HistoryKind, { model: Model<any>; key: string }> = {
  // biome-ignore lint/suspicious/noExplicitAny: intentional widening across two model generics
  decision: { model: DecisionModel as unknown as Model<any>, key: "id" },
  // biome-ignore lint/suspicious/noExplicitAny: intentional widening across two model generics
  memory: { model: MemoryModel as unknown as Model<any>, key: "slug" },
};

/** Load the full version chain (oldest → newest, newest = live), or [] if not found. */
export async function loadVersionChain(
  kind: HistoryKind,
  project: string,
  ref: string,
): Promise<VersionEntry[]> {
  await ensureMongoose();
  const cfg = CONFIG[kind];
  const live = (await cfg.model.findOne({ project, [cfg.key]: ref }, { embedding: 0 }).lean()) as
    | Record<string, unknown>
    | null;
  const history = (await historyModelFor(kind)
    .find({ project, ref }, { "snapshot.embedding": 0 })
    .sort({ version: 1 })
    .lean()) as Record<string, unknown>[];

  const entries: VersionEntry[] = history.map((h) => ({
    version: Number(h.version),
    doc: (h.snapshot as Record<string, unknown>) ?? {},
    live: false,
    archived_at: h.archived_at as Date | undefined,
    actor_id: h.actor_id as string | undefined,
    actor_role: h.actor_role as string | undefined,
    branch: (h.branch as string | null | undefined) ?? null,
  }));

  if (live) {
    entries.push({
      version: typeof live.version === "number" ? live.version : 1,
      doc: live as Record<string, unknown>,
      live: true,
      actor_id: (live.actor_id as string | undefined) ?? undefined,
      actor_role: (live.actor_role as string | undefined) ?? undefined,
      branch: (live.branch as string | null | undefined) ?? null,
    });
  }
  return entries;
}
