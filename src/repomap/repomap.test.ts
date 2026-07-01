import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { mock, test } from "node:test";
import { mongoose } from "../db/mongoose.js";
import { SymbolModel } from "../models/symbol.model.js";
import { parseTree } from "./parser.js";
import { RepoMap } from "./store.js";

/**
 * DB-free tests for the repo map. The parser tests use a real temp fixture dir; the
 * `build` tests run against a temp git repo and stub the Mongoose layer (mirrors
 * `auth/users.test.ts`): `mongoose.connect` so `ensureMongoose()` resolves without a
 * real Atlas connection, and `SymbolModel.{deleteMany,insertMany}` backed by a local
 * array so we can assert on the docs that would have been written.
 */

/** Create a temp source tree with a `dist/`-ignored dir. Returns the root path. */
async function makeFixture(opts: { git?: boolean } = {}): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), "aitl-repomap-"));
  await fs.writeFile(join(root, ".gitignore"), "dist/\nlogs/\n");
  await fs.mkdir(join(root, "src"), { recursive: true });
  await fs.writeFile(join(root, "src", "keep.ts"), "export function keptFn() { return other(); }\n");
  await fs.writeFile(join(root, "src", "other.ts"), "export function other() { return 1; }\n");
  // Build output that .gitignore excludes — must NOT be indexed.
  await fs.mkdir(join(root, "dist"), { recursive: true });
  await fs.writeFile(join(root, "dist", "bundled.ts"), "export function shouldBeSkipped() { return 2; }\n");
  if (opts.git) {
    const run = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
    run(["init", "-q"]);
    run(["checkout", "-q", "-b", "feat/testbranch"]);
    run(["config", "user.email", "t@t.co"]);
    run(["config", "user.name", "t"]);
    run(["add", "-A"]);
    run(["-c", "commit.gpgsign=false", "commit", "-q", "-m", "init"]);
  }
  return root;
}

/** Stub the Mongoose layer; capture inserted docs into `inserted`. */
function stubSymbolModel(): { inserted: Record<string, unknown>[]; restore: () => void } {
  const inserted: Record<string, unknown>[] = [];
  mock.method(mongoose, "connect", (async () => mongoose) as never);
  // deleteMany models the "one snapshot at a time" contract: it clears prior docs.
  mock.method(SymbolModel, "deleteMany", (async () => {
    inserted.length = 0;
    return { deletedCount: 0 };
  }) as never);
  mock.method(SymbolModel, "insertMany", (async (docs: Record<string, unknown>[]) => {
    inserted.push(...docs);
    return docs;
  }) as never);
  return { inserted, restore: () => mock.restoreAll() };
}

test("parseTree excludes files under a .gitignore'd dir (dist/)", async () => {
  const root = await makeFixture();
  try {
    const files = await parseTree(root, [".ts"]);
    const rels = files.map((f) => f.file);
    // dist/bundled.ts is ignored; src files are kept.
    assert.ok(rels.some((f) => f.endsWith(join("src", "keep.ts"))), "src/keep.ts should be indexed");
    assert.ok(rels.some((f) => f.endsWith(join("src", "other.ts"))), "src/other.ts should be indexed");
    assert.ok(!rels.some((f) => f.endsWith("bundled.ts")), "dist/bundled.ts must be excluded");
    assert.equal(files.some((f) => f.defs.some(([n]) => n === "shouldBeSkipped")), false, "dist/ defs must not be parsed");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("build stores RELATIVE file paths (portable keys)", async () => {
  const root = await makeFixture();
  const { inserted, restore } = stubSymbolModel();
  try {
    const n = await new RepoMap().build(root, "p");
    assert.ok(n > 0, "should index at least one symbol");
    for (const d of inserted) {
      const file = d.file as string;
      assert.ok(!isAbsolute(file), `file must be relative, got: ${file}`);
      assert.ok(!file.startsWith("dist"), `dist/ symbols must not be stored, got: ${file}`);
    }
    // keptFn lives at the portable path src/keep.ts.
    const kept = inserted.find((d) => d.name === "keptFn");
    assert.equal(kept?.file, join("src", "keep.ts"));
  } finally {
    restore();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("build stamps the current git branch on every symbol", async () => {
  const root = await makeFixture({ git: true });
  const { inserted, restore } = stubSymbolModel();
  try {
    await new RepoMap().build(root, "p");
    assert.ok(inserted.length > 0);
    for (const d of inserted) assert.equal(d.branch, "feat/testbranch");
  } finally {
    restore();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rebuild keeps a CONSTANT symbol count (deleteMany+insertMany, no accumulation)", async () => {
  const root = await makeFixture();
  const { inserted, restore } = stubSymbolModel();
  try {
    const rm = new RepoMap();
    const first = await rm.build(root, "p");
    const countAfterFirst = inserted.length;
    const second = await rm.build(root, "p");
    // Same inputs → same count, and the store holds exactly one snapshot (no doubling).
    assert.equal(second, first);
    assert.equal(inserted.length, countAfterFirst);
  } finally {
    restore();
    await fs.rm(root, { recursive: true, force: true });
  }
});
