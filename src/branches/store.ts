/**
 * BranchStore — gateway to the `branches` collection (ADR-0031). Keyed by
 * (project, repo, name). Mirrors the catalog store pattern.
 */

import type { Db, Document } from "mongodb";
import { getDb } from "../db/client.js";
import { BRANCHES_COLLECTION, type BranchRecord, makeBranchRecord } from "./schemas.js";

export class BranchStore {
  readonly db: Db;
  readonly collection = BRANCHES_COLLECTION;

  constructor(db?: Db) {
    this.db = db ?? getDb();
  }

  async upsert(rec: Partial<BranchRecord> & { project: string; repo: string; name: string }): Promise<BranchRecord> {
    const doc = makeBranchRecord(rec);
    doc.updated_at = new Date();
    const existing = await this.db
      .collection(this.collection)
      .findOne({ project: doc.project, repo: doc.repo, name: doc.name }, { projection: { created_at: 1 } });
    if (existing?.created_at instanceof Date) doc.created_at = existing.created_at;
    await this.db
      .collection(this.collection)
      .updateOne({ project: doc.project, repo: doc.repo, name: doc.name }, { $set: doc }, { upsert: true });
    return doc;
  }

  async get(project: string, repo: string, name: string): Promise<Document | null> {
    return this.db.collection(this.collection).findOne({ project, repo, name });
  }

  async list(opts: { project?: string; repo?: string; kind?: string; limit?: number } = {}): Promise<Document[]> {
    const query: Record<string, unknown> = {};
    if (opts.project !== undefined) query.project = opts.project;
    if (opts.repo !== undefined) query.repo = opts.repo;
    if (opts.kind !== undefined) query.kind = opts.kind;
    return this.db.collection(this.collection).find(query).sort({ updated_at: -1 }).limit(opts.limit ?? 200).toArray();
  }

  async delete(project: string, repo: string, name: string): Promise<boolean> {
    const res = await this.db.collection(this.collection).deleteOne({ project, repo, name });
    return res.deletedCount === 1;
  }
}
