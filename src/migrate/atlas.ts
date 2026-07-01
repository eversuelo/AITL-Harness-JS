/**
 * Database migration helper — copy a database between MongoDB clusters
 * (e.g. local → MongoDB Atlas) using the Node driver. Data only.
 *
 * Indexes are intentionally NOT copied: Atlas Vector/Search indexes don't round-trip,
 * and normal/text indexes are best recreated by the harness's own `aitl init-db`
 * against the target (idempotent, correct text/vector specs).
 *
 * The target URI (with any credentials) is passed in by the caller — never hardcoded.
 */

import { MongoClient } from "mongodb";
import { settings } from "../config.js";

export interface MigrateOpts {
  targetUri: string;
  fromUri?: string; // default: configured MONGODB_URI
  fromDb?: string; // default: configured MONGODB_DB
  toDb?: string; // default: same as fromDb
  collections?: string[]; // default: all
  drop?: boolean; // drop each target collection before copying
  dryRun?: boolean; // report only, no writes
}

export interface MigrateResult {
  collection: string;
  copied: number;
}

/** Copy collections from one cluster's DB to another. Returns per-collection counts. */
export async function migrateToAtlas(opts: MigrateOpts): Promise<MigrateResult[]> {
  const fromUri = opts.fromUri ?? settings.mongodbUri;
  const fromDb = opts.fromDb ?? settings.mongodbDb;
  const toDb = opts.toDb ?? fromDb;

  const src = new MongoClient(fromUri, { serverSelectionTimeoutMS: 8000 });
  const dst = new MongoClient(opts.targetUri, { serverSelectionTimeoutMS: 15000 });

  try {
    await src.connect();
    await src.db(fromDb).command({ ping: 1 });
    await dst.connect();
    await dst.db("admin").command({ ping: 1 }); // fails fast if IP not allowlisted / auth bad

    const sdb = src.db(fromDb);
    const ddb = dst.db(toDb);

    let cols = (await sdb.listCollections().toArray()).map((c) => c.name);
    if (opts.collections?.length) cols = cols.filter((c) => opts.collections?.includes(c));
    cols.sort();

    const out: MigrateResult[] = [];
    for (const c of cols) {
      const docs = await sdb.collection(c).find({}).toArray();
      if (!opts.dryRun) {
        if (opts.drop) await ddb.collection(c).drop().catch(() => {});
        if (docs.length) await ddb.collection(c).insertMany(docs, { ordered: false });
        else await ddb.createCollection(c).catch(() => {}); // preserve empty collections
      }
      out.push({ collection: c, copied: docs.length });
    }
    return out;
  } finally {
    await src.close().catch(() => {});
    await dst.close().catch(() => {});
  }
}
