/**
 * Non-destructive MongoDB connectivity check.
 *
 * Usage: npm run check-db   (or: tsx scripts/checkDb.ts)
 */

import { connectWithFallback, closeClient } from "../src/db/client.js";

async function main(): Promise<void> {
  const result = await connectWithFallback({
    onAttempt: (a) =>
      console.log(a.ok ? `  ✓ ${a.label}: ${a.uri}` : `  ✗ ${a.label}: ${a.uri} — ${a.error}`),
  });
  console.log(`MongoDB ping OK via ${result.label}: ${result.uri} (db=${result.dbName})`);
  if (result.serverVersion !== undefined) {
    console.log(`Server version: ${result.serverVersion}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeClient();
  });
