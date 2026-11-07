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

## Training probes (added ~11:11 AM, cross the wall)

After runs 1–2 the feedback carried no signal (the recorded claim was already reproduced 22/22). Two probes were
run on the original and their full output is sent to the Builder as behavior (train set); the held-out scenarios
stay separate (test set) and only their pass count crosses.

| Probe | Data change | Original app's result |
|---|---|---|
| T1 | relationship `spouse`, patient DOB + sex filled, patient address blank | Missing patient street/city/state; insured street/city/state/DOB/sex lines disappear (`T1.txt`) |
| T2 | facility + provider NPI = `1234567890` (fails the NPI check digit) | both NPI errors disappear (`T2.txt`) |

What the held-out set still tests beyond the probes: patient DOB/sex when blank (T1 had them filled), the
`child` relationship (T1 used `spouse`), and letter-only NPIs (T2 used digits).
