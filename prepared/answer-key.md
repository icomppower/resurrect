# Resurrect — hidden answer key (OpenEMR 5.0.2, Billing Manager → Validate Only)

Prepared Nov 6 2026 from `src/Billing/X12_5010_837P.php` + `src/Billing/Claim.php` (rel-502) and the Nov 4 spike run.
Scorer only. The Observer/Builder never see this file or the source. **Observed** = seen in the spike log
(`out/validate-log.txt`); **inferred** = read from source, not yet triggered.

Flow: check claim → Generate X12 → "Validate Only" → log lines starting `***`. Claim status unchanged.

## Feedback rules (8) — the Builder may receive these as behavior-only feedback

| # | Rule (behavior the rebuild must reproduce) | Trigger (5.0.2 data) | Exact message | Status |
|---|---|---|---|---|
| F1 | Billing facility must have an NPI | `facility.facility_npi` empty for the billing facility | `*** Billing facility has no NPI.` | observed |
| F2 | Rendering provider must have a valid NPI | `users.npi` empty/not 10 chars → 2310B loop skipped | `*** Skipping 2310B because LAST,FIRST has invalid NPI.` (NOT "Rendering provider has no NPI", which only fires inside the loop) | observed |
| F3 | Payer must have a payer ID | `insurance_companies.cms_id` empty | `*** Payer ID is missing for payer '` (message is truncated in 5.0.2, no closing quote/newline; next message glues onto it) | observed |
| F4 | Policy number required | `insurance_data.policy_number` empty | `*** Missing policy number.` | observed |
| F5 | Insured DOB required | `insurance_data.subscriber_DOB` NULL | `*** Missing insured DOB.` | observed |
| F6 | Claim must have charges | sum of `billing.fee` over procedures == 0 | `*** This claim has no charges!` | observed |
| F7 | Each procedure must be justified by a diagnosis | `billing.justify` empty for a fee-type code | `*** Procedure 'A0425' is not justified!` (one line per procedure, code in quotes) | observed |
| F8 | Insured sex required | `insurance_data.subscriber_sex` empty | `*** Missing insured sex.` | observed |

## Held-out rules (4) — never sent across the wall; scored only

| # | Rule | Trigger | Exact message | Status |
|---|---|---|---|---|
| H1 | Service location must have an NPI | `facility.facility_npi` empty for the *service* facility (encounter.facility_id) | `*** Service location has no NPI.` | inferred (spike used one facility as both; message fires only when the 2310C loop is emitted — service facility ≠ billing facility) |
| H2 | Patient DOB required when patient is not the insured | `patient_data.DOB` NULL **and** `insurance_data.subscriber_relationship` ≠ `self` | `*** Missing patient DOB.` | inferred (2010CA loop is skipped when relationship = self; spike used self, so it did not fire) |
| H3 | Patient sex required when patient is not the insured | `patient_data.sex` empty **and** relationship ≠ `self` | `*** Missing patient sex.` | inferred (same guard as H2) |
| H4 | Each procedure must have a charge | `billing.fee` == 0 for a procedure | `*** Procedure 'A0425' has no charges!` | inferred (source line 1228: `if (!$claim->cptCharges($prockey))`; the spike log shows only the claim-level F6 line, so check whether 5.0.2 dedupes or whether `fee` "0.00" vs "" matters before scoring) |

## Faithful-bug notes (stage moments, not scored)

- **Taxonomy rule is dead code.** `Claim::providerTaxonomy()` returns `207Q00000X` when `users.taxonomy` is empty, so `*** Performing provider has no taxonomy code.` can never fire. The handoff's "provider taxonomy" rule is replaced by F8/H4 above.
- **NPIValid() is a length check.** `preg_match("/[0-9]*/", $npi)` matches any string, so `ABCDEFGHIJ` passes. Rebuild choice: reproduce (faithful) or fix (improve) — say which on stage.
- **Payer ID message is truncated** (F3). A faithful rebuild reproduces the glued line; a fixed one closes the quote.
- "Rendering provider is billing under a group" fires whenever the billing facility NPI is set/unset in the group path; it is noise, not a rule.

## Scoring

- Replay the recorded Validate against the rebuild with the same seeded data (seed.sql, UTC dates).
- Score = rules whose message appears (same meaning, wording may differ; the Verifier maps by rule, not string).
- Report `feedback: n/8` and `held-out: n/4` per run. The held-out number is the headline.

## Prepared inputs (disclose in README)

`docker-compose.yml`, `seed.sql`, `out/validate.webm`, `out/trace.zip`, `out/validate.har`, `out/validate-log.txt`, `out/validate-837.txt`, this file.
