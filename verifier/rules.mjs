// Scoring rules. Feedback F1–F8 come from prepared/answer-key.md (all seen in the recording).
// Held-out H1–H4 were re-derived on event day by running these exact scenarios against the ORIGINAL app
// (OpenEMR 5.0.2 in Docker, data edited via SQL) — see verifier/heldout-ground-truth.md. The answer key's
// original H1 (service location NPI) and H4 (per-procedure no charge) never fired in the original, so they
// were replaced with behaviors the original actually shows. Held-out rules never cross the wall.
export const SCENARIOS = {
  fixture: {},                                                        // the recorded claim, unchanged
  P: { 'insured.relationship': 'child' },                             // patient is not the insured
  N: { 'billing_facility.npi': 'ABCDEFGHIJ', 'rendering_provider.npi': 'ABCDEFGHIJ' }, // 10 letters as NPI
};

const has = (re) => (log) => re.test(log);
export const RULES = [
  { id: 'F1', set: 'feedback', scenario: 'fixture', name: 'billing facility NPI required', behavior: 'A dry run on a claim whose billing facility has no NPI must report that the billing facility has no NPI.', test: has(/billing facility has no npi/i) },
  { id: 'F2', set: 'feedback', scenario: 'fixture', name: 'rendering provider NPI', behavior: 'A dry run must report when the rendering provider has no valid NPI (the recording shows the provider block being skipped because of an invalid NPI).', test: has(/skipping[^\n]*npi|provider[^\n]*(invalid|no) npi/i) },
  { id: 'F3', set: 'feedback', scenario: 'fixture', name: 'payer ID required', behavior: 'A dry run must report a missing payer ID.', test: has(/payer id is missing|missing payer id/i) },
  { id: 'F4', set: 'feedback', scenario: 'fixture', name: 'policy number required', behavior: 'A dry run must report a missing policy number.', test: has(/missing policy number|policy number[^\n]*missing/i) },
  { id: 'F5', set: 'feedback', scenario: 'fixture', name: 'insured DOB required', behavior: 'A dry run must report a missing insured date of birth.', test: has(/missing insured (dob|date of birth)/i) },
  { id: 'F6', set: 'feedback', scenario: 'fixture', name: 'claim must have charges', behavior: 'A dry run must report when the claim has no charges in total.', test: has(/claim has no charges/i) },
  { id: 'F7', set: 'feedback', scenario: 'fixture', name: 'procedure must be justified', behavior: 'A dry run must report, once per procedure code, when a procedure is not justified by a diagnosis.', test: (l) => /procedure '?A0425'? is not justified/i.test(l) && /procedure '?G0008'? is not justified/i.test(l) },
  { id: 'F8', set: 'feedback', scenario: 'fixture', name: 'insured sex required', behavior: 'A dry run must report a missing insured sex.', test: has(/missing insured sex/i) },
  { id: 'H1', set: 'heldout', scenario: 'P', name: 'patient DOB when patient is not the insured', test: has(/missing patient (dob|date of birth)/i) },
  { id: 'H2', set: 'heldout', scenario: 'P', name: 'patient sex when patient is not the insured', test: has(/missing patient sex/i) },
  { id: 'H3', set: 'heldout', scenario: 'P', name: 'patient address when patient is not the insured', test: (l) => /missing patient street/i.test(l) && /missing patient city/i.test(l) && /missing patient state/i.test(l) },
  { id: 'H4', set: 'heldout', scenario: 'N', name: 'a 10-character NPI is accepted (length check only)', test: (l) => /\*\*\*/.test(l) && !/billing facility has no npi/i.test(l) && !/(invalid|no) npi/i.test(l.replace(/no billing facility npi and\/or etin/ig, '')) },
];
