/**
 * WHICH AWS ACCOUNT does this script act on? Pinned, and proven, before it
 * touches anything.
 *
 * The ambient credential chain on the founder's machine is never a Quantum
 * Learner account: interactive shells export AWS_PROFILE for an unrelated
 * account, and without it the chain falls back to Altivum's [default], a
 * different org. Every `aws` child and SDK client a script starts inherits
 * that chain, so a script that does not choose acts on whatever the shell
 * carries. The shell twin is scripts/lib/aws-target.sh.
 *
 * Profile: QL_AWS_PROFILE, else `defaultProfile`. AWS_PROFILE is never read;
 * the result is WRITTEN to process.env.AWS_PROFILE so everything started
 * afterwards inherits it.
 * Account: the organization (read through QL_ORG_PROFILE, default org-admin)
 * says which id `accountName` is, and STS, through the same chain the
 * script's own calls will use, must agree. Value-blind: no id is printed
 * (public repo). Any failure, an expired SSO session included, exits 1
 * before the caller has done anything.
 */
import { execFileSync } from "node:child_process";

const scrub = (s) => String(s ?? "").replace(/\d{12}/g, "<account id>");
const firstLine = (s) => scrub(s).split("\n").find((l) => l.trim()) ?? "";

export function pinAwsAccount({ defaultProfile = "ql-prod", accountName = "QL-Prod" } = {}) {
  const profile = process.env.QL_AWS_PROFILE || defaultProfile;
  const orgProfile = process.env.QL_ORG_PROFILE || "org-admin";
  const refuse = (msg) => {
    console.error(`\nREFUSING: ${msg}\n          Nothing was changed.\n`);
    process.exit(1);
  };
  process.env.AWS_PROFILE = profile;
  const aws = (args) =>
    execFileSync("aws", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  let expected = "";
  try {
    expected = aws([
      "--profile", orgProfile,
      "organizations", "list-accounts",
      "--query", `Accounts[?Name=='${accountName}'].Id`,
      "--output", "text",
    ]);
  } catch (err) {
    refuse(
      `could not read the organization through profile '${orgProfile}', so this run cannot prove ` +
        `which account it is about.\n          ${firstLine(err.stderr)}\n` +
        `          Usually the SSO session has expired: aws sso login --profile ${orgProfile}`,
    );
  }
  if (!/^\d{12}$/.test(expected)) {
    refuse(`the organization does not list exactly one account named "${accountName}".`);
  }

  let actual = "";
  try {
    actual = aws(["sts", "get-caller-identity", "--query", "Account", "--output", "text"]);
  } catch (err) {
    refuse(`profile '${profile}' produced no usable credentials.\n          ${firstLine(err.stderr)}`);
  }
  if (actual !== expected) {
    refuse(
      `profile '${profile}' answers for a different account than "${accountName}". ` +
        "Set QL_AWS_PROFILE to a profile that reaches it.",
    );
  }
  console.error(`  account: ${accountName} verified by name (profile '${profile}')`);
  return { profile, accountName };
}
