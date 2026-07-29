#!/usr/bin/env node
// Prints the emailHash for a Founding Ten registry row.
//   node scripts/badge-email-hash.mjs "someone@example.com"
// Normalization must stay identical to normalizeEmail() in
// web/src/lib/founding-ten.ts — a shared known vector asserts it.
import { createHash } from "node:crypto";

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/badge-email-hash.mjs <email>");
  process.exit(2);
}
process.stdout.write(createHash("sha256").update(email.trim().toLowerCase()).digest("hex"));
