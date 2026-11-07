# Resurrect

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

**Record yourself using an old app. Resurrect rebuilds the screen clean-room and proves every behavior matches the original before it ships.**

Built at the AIE Code Summit Hackathon, Sat Nov 7 2026. Tracks: Software Archaeology + The System That Gets Better.
Not affiliated with the OpenEMR Foundation.

## How it works

```
recording ──► Observer ──spec.json──► │ WALL │ ──► clean-room Builder ──► rebuild/runN
 (dirty room)  (Claude, sees video)   │linter│     (isolated claude -p,        │
                                      │ +log │      sees only spec + data)     ▼
                 behavior-only feedback ◄──────────────────────────────── Verifier
                                                    (Playwright replay vs the ORIGINAL app's behavior;
                                                     8 feedback rules + 4 held-out rules + line equivalence)
```

- **Observer** (`observer/observe.mjs`): frames from the 6-second recording + the app's end-of-run log → a behavior-only spec with every rule marked *observed* or *inferred*. No product name, code, paths or images (linted).
- **Wall** (`lib/wall.mjs`, `wall.log`): every artifact that crosses into the clean room is linted and logged with its sha256, plus the Builder's exact prompt and input/output hashes.
- **Clean-room Builder** (`builder/build.mjs`): a separate `claude -p` in `/tmp/cleanroom-runN/` that holds only `spec.json`, `claim.json`, `replay-contract.md` (+ `feedback.json` from run 2). Tools: Read/Write/Edit only; Read is denied on the repo and home folders; user settings are not loaded. The session that built this harness has read the held-out rules, so it never writes the rebuild.
- **Verifier** (`verifier/verify.mjs`): replays the recorded flow (select claim → generate claim file → validate only → read log) against the rebuild in three scenarios, scores by rule (meaning, not string), and measures line-level equivalence with what the original app printed in the same scenarios (`verifier/ground-truth/`). Feedback that crosses back is behavior-only; held-out rules never cross.
- **Fetch.ai agent** (`agent/verifier_agent.py`): the Verifier as a uAgent with the Agent Chat Protocol on Agentverse. From ASI:One: `loop` runs the next Builder run and verifies it, `verify N`, `status`, `wall`.

## Results

Real numbers from `runs/runN/score.json` (Observer: Claude, 32 rules, 24 observed / 8 inferred; every Builder run
is a fresh isolated `claude -p`, ~2 min each):

| Run | Feedback that crossed the wall | Feedback rules | Recording match | Probes exact | **Held-out** |
|---|---|---|---|---|---|
| 1 | — (spec only) | 8/8 | 22/22 | 1/3 | **0/4** |
| 2 | run 1 result (all green) + held-out count | 8/8 | 22/22 | 2/3 | **0/4** |
| 3 | + original app's output on 2 training probes | 8/8 | 22/22 | 3/3 | **3/4** |
| 4 | run 3 result — triggered from chat via the Fetch.ai agent (`loop`) | 8/8 | 22/22 | 3/3 | **3/4** |

Runs 1–2 show the failure mode: when the only feedback is the recording, a perfect replay teaches nothing. Run 3
learned "patient ≠ insured" from one spouse probe and generalized to the held-out child case (DOB/sex it never saw
fire). The remaining red, H4, is the original's bug: 5.0.2 accepts any 10 characters as an NPI; the rebuild requires
digits. The Verifier surfaces it as a divergence for a human to choose faithful vs. fixed.

## Fetch.ai agent

| Agent | Address | Role |
|---|---|---|
| resurrect-verifier | `agent1qd2g8tfg3xfjmmnddlmz75rr5znealnttkataz58tjhxwh2hqs6txsgclsl` | Tells the Resurrect story in plain language, runs a live clean-room rebuild on request, and logs the human's faithful-vs-fixed decision |

ASI:One handle: @resurrect (type @resurrect before every message)

Chat with it from ASI:One (`@resurrect rebuild`). Plain-language flow:

- `hi` / `help` → one-paragraph intro.
- `rebuild` → one message (ASI:One shows only the agent's last reply per question) built from the best saved run (labelled with its run number): what was seen in the recording (rule counts and three examples, seen vs. guessed), the handoff to Claude Code (link to `wall.log`), the result (recording steps passed, test cases never shown, live link), and the human call as an interactive card (**Copy old / Keep fix**). The card also says "(or reply: copy old / keep fix)" in case the card doesn't render in the ASI:One web UI.
- `rebuild live` → the rules and handoff first, then the full story in one final message after Claude Code builds a new run on the spot (~2 min) and the Verifier scores it; on any error it falls back to the saved run.
- Card click / `copy old` / `keep fix` → appended to `wall.log` as a human decision.
- Power-user commands: `status`, `verify N`, `loop`, `wall`.

All numbers come from `runs/spec.json`, `runs/runN/score.json` and `wall.log`.

Run it: `~/fetch-hello/.venv/bin/python agent/verifier_agent.py` (Python 3.12, uagents 0.26.1; `AGENT_SEED` in `.env`). Test without ASI:One: `agent/chat_test.py "rebuild" 60 4`. Category: Innovation Lab.

## Run it yourself

```bash
docker compose -f prepared/docker-compose.yml up -d        # OpenEMR 5.0.2 + MariaDB 10.4 (amd64)
docker compose -f prepared/docker-compose.yml exec -T mysql mysql -uroot -proot openemr < prepared/seed.sql
pnpm install
node observer/observe.mjs          # → runs/spec.json
node builder/build.mjs 1           # → runs/run1/index.html (clean room)
node verifier/verify.mjs 1         # → runs/run1/score.json + feedback.json
node builder/build.mjs 2 && node verifier/verify.mjs 2
```

## Built today vs. prepared

**Built during the event (after 9 AM Sat Nov 7):** all code in this repo (`observer/`, `lib/`, `builder/`, `verifier/`, `agent/`, `fixture/`, `contract/`), the held-out ground-truth runs (`verifier/ground-truth/P.txt`, `N.txt`, captured ~11:05 AM against the original), every run in `runs/`, `wall.log`.

**Prepared before the event and disclosed** (`prepared/`): the OpenEMR 5.0.2 Docker compose file and `seed.sql` (fake data; ICD-10 + HCPCS Level II only, no CPT), the recording `validate.webm`, Playwright `trace.zip` + `validate.har`, `validate-log.txt`, `validate-837.txt`, and the hidden answer key `answer-key.md`. On event day two of the answer key's four held-out rules did not fire in the original app and were replaced with verified behaviors — see `verifier/heldout-ground-truth.md`.

## License

GPLv3 (the answer key derives from OpenEMR's GPL source).
