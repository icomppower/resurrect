# Held-out ground truth (captured Sat Nov 7 2026, ~11:05 AM PST, during the event)

The prepared answer key listed four held-out rules read from source. Before scoring anything, each held-out
scenario was run against the ORIGINAL app (OpenEMR 5.0.2 in Docker, prepared seed, data edited with SQL, then
the same Billing Manager → Generate X12 → Validate Only replay). Logs are in `ground-truth/`.

| Scenario | Data change | Original app's result |
|---|---|---|
| fixture | none (the recording) | 21 `***` lines (`fixture.txt`) |
| P | insured relationship `self` → `child` | adds Missing patient street/city/state/DOB/sex; insured street/city/state/DOB/sex lines disappear (`P.txt`) |
| N | billing facility NPI and provider NPI = `ABCDEFGHIJ` | both NPI errors disappear: the NPI check is length-only (`N.txt`) |

Answer-key rules that did NOT hold: H1 service location NPI (second facility with blank NPI as the encounter's
facility → no line) and H4 per-procedure "has no charges" (one $10 + one $0 procedure → no line). They were
replaced. Held-out set used for scoring: H1 patient DOB (P), H2 patient sex (P), H3 patient street+city+state (P),
H4 10-letter NPI accepted (N). None of this crosses the wall.
