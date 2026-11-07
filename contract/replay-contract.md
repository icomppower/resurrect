# Replay contract (written by the harness, not derived from the original app)

The Verifier drives your page with a browser. It needs these hooks. Everything else (look, layout, wording of
labels) is yours.

1. One self-contained file `index.html`. No network requests, no external scripts or fonts. Embed the claim data
   from `claim.json` inside the page (it is loaded fresh on every page load). Replace the encounter date "TODAY"
   with the current date at load time.
2. The claim appears in a work queue with a checkbox: `<input type="checkbox" name="claims[1-1]">`.
3. A button `#btn-x12` starts claim-file generation for the selected claims. If you put it inside a menu, the
   menu opener must have id `#gen-toggle`.
4. Generation opens a confirm dialog with a button `#btn-validate` for the dry-run ("validate only") path.
5. After the dry run, the full text log is visible as plain text in an element `#log`, one message per line.
   If the log needs a click to show, that control has id `#view-log`.
6. A "claim data" panel lets a user edit the claim before validating: one input per leaf field of `claim.json`,
   whose `name` attribute is the field's dotted path (e.g. `patient.dob`, `insured.relationship`,
   `procedures.0.fee`). Use a `<select>` for fields listed in `_enums`. Validation reads the current panel values.
