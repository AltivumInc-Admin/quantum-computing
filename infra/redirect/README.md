# `quantumlearner.dev` → `quantum.altivum.ai` redirect

A vanity-domain 301 redirect: `quantumlearner.dev` and `www.quantumlearner.dev`
send visitors to the live platform at `https://quantum.altivum.ai/`, preserving
path and query string.

## How it works

`quantumlearner-dev.yaml` is a single CloudFormation stack (deploy in **us-east-1**):

- **ACM certificate**, DNS-validated — CloudFormation creates the Route 53
  validation records itself in zone `Z0634247WVFEYFGO8EVF` and waits for issue.
  (HTTPS is mandatory: `.dev` is on the HSTS preload list.)
- **CloudFront Function** (viewer-request) returns the `301` at the edge — no S3
  bucket, no origin fetch.
- **CloudFront distribution** with both hostnames as aliases + the cert.
- **Route 53 A/AAAA aliases** for apex + `www` → the distribution.
- **Monitoring** so no failure is silent:
  - a **fail-loud origin** (`origin-disabled.quantumlearner.dev`, intentionally
    non-existent) → a removed function 502s loudly instead of proxying a broken
    clone of the site;
  - CloudWatch alarms on `FunctionExecutionErrors`, `FunctionValidationErrors`,
    and `5xxErrorRate`;
  - a **Lambda canary** every 15 min that HEADs both hostnames and asserts
    `301` + the correct `Location`, with an alarm on the custom `Healthy` metric
    (catches "301s to the wrong place", cert/DNS breakage, or a down domain);
  - all of the above notify one **SNS topic** → your email.

## Deploy

```bash
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name quantumlearner-dev-redirect \
  --template-file infra/redirect/quantumlearner-dev.yaml \
  --parameter-overrides AlarmEmail=you@example.com \
  --capabilities CAPABILITY_IAM \
  --tags project=quantum purpose=domain-redirect
```

Takes ~10–25 min (ACM validation + CloudFront propagation). **After it finishes,
click the confirmation link in the "AWS Notification" email** or the alarms
can't reach you (the SNS subscription stays pending until you do).

## Verify

```bash
curl -sI https://quantumlearner.dev     | grep -iE 'HTTP|location'
curl -sI https://www.quantumlearner.dev | grep -iE 'HTTP|location'
```

Both should show `HTTP/2 301` and `location: https://quantum.altivum.ai/`.
Allow a few minutes for edge propagation. If a browser refuses but `curl`
works, clear the browser's HSTS entry for `quantumlearner.dev` and reload.

## Operate

- **This distribution is IaC-only — never edit it in the console.** A manual
  change is drift; run `aws cloudformation detect-stack-drift --region us-east-1
  --stack-name quantumlearner-dev-redirect` periodically to catch it.
- The ACM cert **auto-renews** as long as the CFN-managed validation record
  stays in the zone (it does).
- To change the redirect target, update `RedirectTarget` and redeploy.

## Rollback / teardown

```bash
aws cloudformation delete-stack --region us-east-1 --stack-name quantumlearner-dev-redirect
```

Removes the distribution, cert, DNS records, canary, alarms, and SNS topic.
`quantumlearner.dev` stops resolving (back to no record). CloudFront
disable+delete is slow (~15 min); CloudFormation handles it.
