/**
 * Audit log — durable record of sensitive actions (accepted and rejected).
 *
 * Every privileged decision (RBAC allow/deny on a mutation, login, user mgmt)
 * appends one `AuditEvent` to the `audit` collection. Auditors read it; nobody
 * mutates it through normal flows. Mirrors the shape in `docs/RBAC-REGISTRO.md`.
 */

import type { Db } from "mongodb";
import { getDb } from "../db/client.js";

export const AUDIT_COLLECTION = "audit";

export interface AuditEvent {
  actor_id: string;
  actor_role: string;
  source: "web" | "server" | "mcp" | "cli" | "host-agent";
  action: string;
  resource: string;
  resource_owner?: string;
  ok: boolean;
  reason?: string;
  ts: Date;
}

/**
 * Append an audit event. Never throws into the caller's path: auditing must not
 * break the operation it records, so failures are logged to stderr and swallowed.
 */
export async function recordAudit(
  event: Omit<AuditEvent, "ts"> & { ts?: Date },
  db: Db = getDb(),
): Promise<void> {
  const doc: AuditEvent = { ...event, ts: event.ts ?? new Date() };
  try {
    await db.collection(AUDIT_COLLECTION).insertOne(doc);
  } catch (err) {
    console.error(`[audit] failed to record event: ${err instanceof Error ? err.message : String(err)}`);
  }
}
