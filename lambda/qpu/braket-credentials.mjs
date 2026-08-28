// Credentials for the BraketClient, and nothing else. When BRAKET_ROLE_ARN is
// set, Braket calls execute in the Braket Workloads account under a role scoped
// to Garnet + the results bucket; unset reproduces same-account behaviour
// byte-for-byte (the rollback is unsetting it — same pattern as WALLET_TABLE).
// The SDK provider caches and auto-refreshes: one STS call per cold container.
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

export function braketCredentials(env, from = fromTemporaryCredentials) {
  const roleArn = env.BRAKET_ROLE_ARN;
  if (!roleArn) return undefined;
  const externalId = env.BRAKET_EXTERNAL_ID;
  if (!externalId) {
    throw new Error("BRAKET_ROLE_ARN is set but BRAKET_EXTERNAL_ID is not — refusing a trust-policy mismatch");
  }
  return from({
    params: {
      RoleArn: roleArn,
      ExternalId: externalId,
      RoleSessionName: "quantum-qpu-braket",
      DurationSeconds: 900,
    },
  });
}
