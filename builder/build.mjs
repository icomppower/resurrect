// Clean-room Builder runner. The Builder is a separate `claude -p` in a folder OUTSIDE the repo that holds only
// what crossed the wall: spec.json, claim.json, replay-contract.md (+ feedback.json from run 2). No Bash, no web,
// no search tools; project settings deny Read on the repo, the spike folder and the home folder; user settings
// are not loaded. The exact prompt and input/output hashes go to wall.log. Output is copied to runs/runN/.
// usage: node builder/build.mjs <N>
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cross, wall, sha256 } from '../lib/wall.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const N = Number(process.argv[2] || 1);
const ROOM = `/tmp/cleanroom-run${N}`;
const RUN = `${ROOT}runs/run${N}`;

fs.rmSync(ROOM, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOM, '.claude'), { recursive: true });
const inputs = [
  [ROOT + 'runs/spec.json', 'spec.json', 'observer'],
  [ROOT + 'fixture/claim.json', 'claim.json', 'harness'],
  [ROOT + 'contract/replay-contract.md', 'replay-contract.md', 'harness'],
];
if (N > 1) inputs.push([`${ROOT}runs/run${N - 1}/feedback.json`, 'feedback.json', 'verifier']);
for (const [src, name, from] of inputs) {
  cross(src, from, `builder(run${N})`, { run: N });            // lint + log every input
  fs.copyFileSync(src, path.join(ROOM, name));
}
if (N > 1) fs.copyFileSync(`${ROOT}runs/run${N - 1}/index.html`, path.join(ROOM, 'previous-index.html'));
const deny = ['//Volumes/**', '//Users/**', `//private/tmp/claude-*/**`].map((p) => `Read(${p})`);
fs.writeFileSync(path.join(ROOM, '.claude/settings.json'), JSON.stringify({ permissions: { deny, allow: ['Read(./**)', 'Write(./**)', 'Edit(./**)'] } }, null, 2));

const PROMPT = `You are the BUILDER in a clean-room rebuild of one screen of an old business web app. You have never seen
the app. Everything you may use is in this folder:
- spec.json: a behavioral spec written by an observer who watched a recording (rules marked observed or inferred).
- claim.json: the claim data shown in the recording.
- replay-contract.md: the hooks an automated verifier uses to drive your page. Follow it exactly.
${N > 1 ? `- feedback.json: behavior-only feedback from the verifier about your previous build.
- previous-index.html: your previous build. Improve it; keep what works.\n` : ''}
Write index.html in this folder: a fresh, self-contained one-page app with its OWN look (do not imitate any
particular product) that reproduces the behavior in spec.json against the claim data, including the dry-run
validation and its log. Implement the observed rules faithfully, including quirks the spec records. For each
inferred rule, use your judgment: implement it if the spec's reasoning is sound. Do not read anything outside
this folder. When done, reply with one line: the number of validation rules you implemented.`;

wall({ from: 'harness', to: `builder(run${N})`, run: N, room: ROOM, prompt: PROMPT, tools: 'Read,Write,Edit', inputs: fs.readdirSync(ROOM).filter((f) => !f.startsWith('.')).map((f) => ({ f, sha256: sha256(fs.readFileSync(path.join(ROOM, f))) })) });

const t0 = Date.now();
const r = spawnSync('/opt/homebrew/bin/claude', ['-p', PROMPT, '--setting-sources', 'project,local', '--allowedTools', 'Read,Write,Edit',
  '--disallowedTools', 'Bash,WebFetch,WebSearch,Glob,Grep,Task,Agent,NotebookEdit', '--permission-mode', 'acceptEdits', '--output-format', 'text'],
  { cwd: ROOM, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 25 * 60 * 1000 });
const secs = Math.round((Date.now() - t0) / 1000);
if (r.status !== 0 || !fs.existsSync(path.join(ROOM, 'index.html'))) {
  wall({ from: `builder(run${N})`, to: 'harness', run: N, error: (r.stderr || r.stdout || '').slice(0, 300) });
  throw new Error(`builder run ${N} failed (${secs} s): ${(r.stderr || r.stdout).slice(0, 600)}`);
}
fs.mkdirSync(RUN, { recursive: true });
fs.copyFileSync(path.join(ROOM, 'index.html'), `${RUN}/index.html`);
fs.writeFileSync(`${RUN}/builder-reply.txt`, r.stdout);
const outs = fs.readdirSync(ROOM).filter((f) => !f.startsWith('.')).map((f) => ({ f, sha256: sha256(fs.readFileSync(path.join(ROOM, f))) }));
wall({ from: `builder(run${N})`, to: 'harness', run: N, seconds: secs, outputs: outs, reply: r.stdout.trim().slice(0, 200) });
console.log(`run ${N}: index.html ${fs.statSync(`${RUN}/index.html`).size} bytes in ${secs} s — ${r.stdout.trim().slice(0, 200)}`);
