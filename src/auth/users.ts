import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "mongodb";
import { settings } from "../config.js";
import { getDb } from "../db/client.js";
import { ROLES, type Role, isRole } from "./rbac.js";

const USERS_COLLECTION = "users";
const HASH_ITERATIONS = 310_000;
const HASH_KEYLEN = 32;
const HASH_DIGEST = "sha256";

/** Fields safe to return to clients (never hashes/salts). */
export const PUBLIC_USER_PROJECTION = {
  password_hash: 0,
  password_salt: 0,
  password_algo: 0,
  _id: 0,
} as const;

export interface UserSeed {
  username: string;
  email: string;
  password: string;
  role?: string;
}

export interface PublicUser {
  username: string;
  email: string;
  role: Role;
  disabled?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface BootstrapUserResult {
  status: "skipped" | "created" | "exists" | "needs-root";
  reason?: string;
  username?: string;
  email?: string;
  role?: string;
}

export interface VerifyUserResult {
  ok: boolean;
  reason?: string;
  username?: string;
  email?: string;
  role?: string;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Validate a role string against the RBAC role set. */
export function validateRole(role: string): Role {
  if (!isRole(role)) {
    throw new Error(`role must be one of: ${ROLES.join(", ")}.`);
  }
  return role;
}

export function validateUserSeed(seed: UserSeed): void {
  const username = normalizeUsername(seed.username);
  const email = normalizeEmail(seed.email);
  const password = seed.password;

  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
    throw new Error("username must be 3-32 chars and use letters, numbers, dot, underscore or dash.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("email must be a valid email address.");
  }
  if (password.length < 12) {
    throw new Error("password must be at least 12 characters.");
  }
  if (seed.role !== undefined && seed.role !== "") validateRole(seed.role);
}

function hashPassword(password: string): { password_hash: string; password_salt: string; password_algo: string } {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST).toString("base64url");
  return {
    password_hash: hash,
    password_salt: salt,
    password_algo: `pbkdf2:${HASH_DIGEST}:${HASH_ITERATIONS}:${HASH_KEYLEN}`,
  };
}

function verifyPassword(password: string, doc: Record<string, unknown>): boolean {
  if (typeof doc.password_hash !== "string" || typeof doc.password_salt !== "string" || typeof doc.password_algo !== "string") {
    return false;
  }
  const [, digest, iterationsRaw, keylenRaw] = doc.password_algo.split(":");
  const iterations = Number(iterationsRaw);
  const keylen = Number(keylenRaw);
  if (!digest || !Number.isInteger(iterations) || !Number.isInteger(keylen)) return false;

  const expected = Buffer.from(doc.password_hash, "base64url");
  const actual = pbkdf2Sync(password, doc.password_salt, iterations, keylen, digest).subarray(0, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function bootstrapSeedFromSettings(): UserSeed | null {
  const username = settings.bootstrapUsername.trim();
  const email = settings.bootstrapEmail.trim();
  const password = settings.bootstrapPassword;
  if (!username && !email && !password) return null;
  if (!username || !email || !password) return null;
  return { username, email, password, role: settings.bootstrapRole.trim() || "root" };
}

export async function countUsers(db: Db = getDb()): Promise<number> {
  return db.collection(USERS_COLLECTION).countDocuments();
}

export async function rootExists(db: Db = getDb()): Promise<boolean> {
  return (await db.collection(USERS_COLLECTION).countDocuments({ role: "root" })) > 0;
}

export async function getUser(username: string, db: Db = getDb()): Promise<PublicUser | null> {
  const doc = await db
    .collection(USERS_COLLECTION)
    .findOne({ username: normalizeUsername(username) }, { projection: PUBLIC_USER_PROJECTION });
  return (doc as PublicUser | null) ?? null;
}

export async function listUsers(db: Db = getDb()): Promise<PublicUser[]> {
  return (await db
    .collection(USERS_COLLECTION)
    .find({}, { projection: PUBLIC_USER_PROJECTION })
    .sort({ created_at: 1 })
    .toArray()) as unknown as PublicUser[];
}

/**
 * Insert a new user. Validation + uniqueness only — RBAC (only `root` may create
 * users) is enforced at the call site, which also writes the audit event.
 */
export async function createUser(seed: UserSeed, db: Db = getDb()): Promise<PublicUser> {
  validateUserSeed(seed);
  const username = normalizeUsername(seed.username);
  const email = normalizeEmail(seed.email);
  const role = validateRole((seed.role ?? "user").trim() || "user");

  const existing = await db.collection(USERS_COLLECTION).findOne({ $or: [{ username }, { email }] });
  if (existing) throw new Error(`a user with that username or email already exists.`);

  const now = new Date();
  await db.collection(USERS_COLLECTION).insertOne({
    username,
    email,
    role,
    ...hashPassword(seed.password),
    disabled: false,
    created_at: now,
    updated_at: now,
  });
  return { username, email, role, disabled: false, created_at: now, updated_at: now };
}

export async function setUserRole(username: string, role: string, db: Db = getDb()): Promise<PublicUser> {
  const newRole = validateRole(role);
  const uname = normalizeUsername(username);
  const res = await db
    .collection(USERS_COLLECTION)
    .findOneAndUpdate(
      { username: uname },
      { $set: { role: newRole, updated_at: new Date() } },
      { returnDocument: "after", projection: PUBLIC_USER_PROJECTION },
    );
  if (!res) throw new Error(`no user '${uname}'.`);
  return res as unknown as PublicUser;
}

export async function setUserDisabled(username: string, disabled: boolean, db: Db = getDb()): Promise<PublicUser> {
  const uname = normalizeUsername(username);
  const res = await db
    .collection(USERS_COLLECTION)
    .findOneAndUpdate(
      { username: uname },
      { $set: { disabled, updated_at: new Date() } },
      { returnDocument: "after", projection: PUBLIC_USER_PROJECTION },
    );
  if (!res) throw new Error(`no user '${uname}'.`);
  return res as unknown as PublicUser;
}

/**
 * Idempotent first-user bootstrap. Enforces the RBAC-REGISTRO rules:
 *   1. If `users` is empty, create the first user ONLY when its role is `root`.
 *   2. If any user already exists, do not register more here (use `aitl user create`
 *      as an authenticated root).
 */
export async function bootstrapBaseUser(
  db: Db = getDb(),
  seed: UserSeed | null = bootstrapSeedFromSettings(),
): Promise<BootstrapUserResult> {
  if (seed === null) return { status: "skipped", reason: "bootstrap user env is not configured" };
  validateUserSeed(seed);

  const username = normalizeUsername(seed.username);
  const email = normalizeEmail(seed.email);
  const role = (seed.role ?? "root").trim() || "root";
  const coll = db.collection(USERS_COLLECTION);

  const total = await coll.countDocuments();
  if (total > 0) {
    const existing = await coll.findOne({ $or: [{ username }, { email }] });
    if (existing) {
      return {
        status: "exists",
        username: String(existing.username ?? username),
        email: String(existing.email ?? email),
        role: String(existing.role ?? role),
      };
    }
    return {
      status: "skipped",
      reason: "users already exist; bootstrap only creates the first user. Use an authenticated root (aitl user create).",
    };
  }

  if (role !== "root") {
    return {
      status: "needs-root",
      reason: "the first user must be root. Set AITL_BOOTSTRAP_ROLE=root and run again.",
    };
  }

  validateRole(role);
  const now = new Date();
  await coll.insertOne({
    username,
    email,
    role,
    ...hashPassword(seed.password),
    disabled: false,
    created_at: now,
    updated_at: now,
  });
  return { status: "created", username, email, role };
}

export async function verifyUserCredentials(opts: UserSeed, db: Db = getDb()): Promise<VerifyUserResult> {
  validateUserSeed(opts);
  const username = normalizeUsername(opts.username);
  const email = normalizeEmail(opts.email);
  const user = await db.collection(USERS_COLLECTION).findOne({ username, email });
  if (!user) return { ok: false, reason: "user not found for username/email" };
  if (user.disabled === true) return { ok: false, reason: "user is disabled", username, email };
  if (!verifyPassword(opts.password, user)) return { ok: false, reason: "invalid password", username, email };
  return { ok: true, username, email, role: String(user.role ?? "") };
}
