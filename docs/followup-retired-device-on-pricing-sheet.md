# Follow-up: a retired device is still on the published rate sheet

**Opened 2026-09-04. Not fixed in the device-fleet change, deliberately.**

## The finding

`web/src/lib/pricing.ts` publishes a customer-facing per-shot rate for
**Rigetti Ankaa-3** in `HARDWARE_RATES`. The pricing page renders `HARDWARE_RATES`,
so that row is an advertised rate for a machine that cannot accept a task.

Verified against live Amazon Braket on 2026-09-04 (`braket:SearchDevices`, all five
Braket regions). Every name on the published sheet, with its live status:

| Published in `HARDWARE_RATES` | Live status |
| --- | --- |
| Rigetti Cepheus-1-108Q | ONLINE (us-west-1) |
| **Rigetti Ankaa-3** | **RETIRED (us-west-1)** |
| IQM Garnet | ONLINE (eu-north-1) |
| IQM Emerald | ONLINE (eu-north-1) |

Ankaa-3 is the only one. Ankaa-2 and the whole Aspen family are retired too, but
they were never on the sheet.

This is rule 13 — "never advertise what the deployed system cannot do" — on the
strongest possible facts: not a surface that is switched off, a machine that
physically no longer exists.

## Why the fleet change did not fix it

Two reasons, both deliberate.

1. **`pricing.ts` is off-limits to that work.** Published customer pricing is
   mirrored by `CATALOG` in `lambda/stripe/index.mjs` and a test asserts the two
   stay in lockstep. Removing a row is a monetization decision with a server-side
   twin, not a drive-by edit inside a curriculum change.
2. **Nothing in the repo could have caught it.** `scripts/check-device-fleet.mjs`
   compares the live Braket fleet against `lib/hardware/devices.py` only. It has
   never read `pricing.ts`, so a retired machine can sit on the customer sheet
   indefinitely with `make fleet` green.

The README's retirement sentence was narrowed in the same change to say "carry no
row **in this repo's device tables**", so the docs no longer assert something the
pricing sheet contradicts. That is a scoping fix, not a fix for this.

## What is owed

1. **Drop the Rigetti Ankaa-3 row from `HARDWARE_RATES`.** Check `CATALOG` in
   `lambda/stripe/index.mjs` in the same change — the lockstep test is the reason
   this is one edit and not two. Do not restate any rate figure while doing it;
   the numbers live in `pricing.ts` and nowhere else (CLAUDE.md rule 8).
2. **Extend `scripts/check-device-fleet.mjs`** to also compare every
   `HARDWARE_RATES` device name against live `deviceStatus`, and fail on any name
   that is RETIRED or that Braket does not list at all. The script already reads
   all five regions and already has the comparison shape; it needs a second source
   list and a second divergence class. Once it does, `make fleet` and the nightly
   workflow cover the customer sheet as well as the curriculum.
3. **Decide the OFFLINE case explicitly while writing it.** IonQ Forte 1 is
   currently OFFLINE, not retired. OFFLINE is temporary and a rate for it is not
   obviously false, so the guard should almost certainly fail on RETIRED and
   missing, and report OFFLINE without failing. Whatever is chosen, put the
   reasoning in the script rather than in this file.

## Guardrails for whoever picks this up

- Do not add the newly adopted devices (IonQ Forte Enterprise 1, AQT IBEX Q1) to
  `HARDWARE_RATES` while you are in there. Adopting a device into the curriculum
  is not the same as putting it on the customer sheet; that is a separate
  monetization decision.
- The storefront is closed and hardware runs are not funded, so this is not
  urgent revenue work. It is a truth-in-advertising defect on an indexed public
  page, which is why it is written down rather than left in a review thread.
