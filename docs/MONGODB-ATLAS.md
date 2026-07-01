# MongoDB / Atlas Vector Search

AITL stores embeddings and queries them with `$vectorSearch`, and creates its search
indexes with `createSearchIndex`. Both are **Atlas Search / Atlas Vector Search** features:
a plain `mongod` does **not** provide them and will fail on `init-db`. This is the
operational companion to [ADR-0002](adr/0002-mongodb-atlas-vector-search.md).

You have two supported options; the harness uses the same driver/model code for both, and
only `MONGODB_URI` changes:

- **Local** — the bundled `docker-compose.yml`, which runs the official
  `mongodb/mongodb-atlas-local` image. It bundles the same Search engine as cloud Atlas and
  exposes the identical `$vectorSearch` API, so it is reproducible locally.
- **Cloud** — a real MongoDB Atlas cluster whose tier supports Atlas Search / Vector Search.

## Option A — local (docker-compose)

```bash
docker compose up -d
aitl config set MONGODB_URI "mongodb://localhost:27017/?directConnection=true"
aitl config set MONGODB_DB aitl
aitl init-db          # creates collections, indexes and the vector_index
aitl check-db         # should print "RBAC status: ready"
```

## Option B — cloud Atlas

Copy the connection string from your cluster (Atlas → Connect → Drivers) and store it in
the user-level profile — **not** in git:

```bash
aitl config set MONGODB_URI "mongodb+srv://<user>:<password>@<cluster>.mongodb.net/aitl?appName=<app>"
aitl config set MONGODB_DB aitl
```

If you prefer a `.env` file for a local checkout instead of the global profile:

```dotenv
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/<database>?retryWrites=true&w=majority&appName=aitl-harness
MONGODB_DB=aitl
```

Do not commit `.env`. If the password contains special characters (`@ : / ? # %`),
URL-encode them (for example `*` → `%2A`).

Atlas prerequisites:

- A database user with `readWrite` on `MONGODB_DB`.
- Atlas Network Access allows your current IP address.
- The cluster tier supports Atlas Search / Vector Search.

## Relevant environment variables

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Primary connection string (local `directConnection` or an Atlas `mongodb+srv` string). |
| `MONGODB_URI_FALLBACK` | Optional second URI tried when the primary is unreachable (local ↔ Atlas). |
| `MONGODB_DB` | Database name (default `aitl`). |
| `EMBEDDING_PROVIDER` | `local` (default) or `voyage`. |
| `EMBEDDING_MODEL` | Embedding model id (default `Xenova/all-MiniLM-L6-v2`). |
| `EMBEDDING_DIMS` | Embedding dimension — **must match the active embedder and the vector index** (default `384`). |

You can set a local fallback for a cloud-first setup via `MONGODB_URI_FALLBACK` (Atlas by
seedlist with a fall-through to local; see [ADR-0009](adr/0009-atlas-migration-via-driver.md)).

## Verify connectivity

```bash
aitl check-db
```

Expected output redacts credentials:

```text
MongoDB ping OK via primary: <redacted-uri> (db=aitl)
Users collection OK
Root user: exists
RBAC status: ready
```

## Create collections and indexes

After `check-db` passes:

```bash
aitl init-db
```

This creates the collections, the scalar/text indexes, and the `vector_index` Atlas Vector
Search indexes for `messages`, `memory` and `decisions`. It is idempotent.

## Troubleshooting

| Symptom | Likely fix |
|---|---|
| `Server selection timed out` | Check Atlas Network Access and the cluster hostname. |
| `bad auth` / authentication failed | Check username, password URL-encoding, and database-user permissions. |
| Vector index creation fails | Use Atlas or `mongodb/mongodb-atlas-local`; a plain `mongod` has no Vector Search. |
| Vector search returns no results | Wait until the Atlas Search indexes are `READY`, then re-ingest documents if needed. |
