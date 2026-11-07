// Observer (dirty room): watches the recording + its end-of-run log and writes a behavior-only spec.
// Backend: Gemini if GEMINI_API_KEY + GEMINI_MODEL are set, else Claude (`claude -p`, isolated temp folder,
// Read-only tool, no web). Output: runs/spec.json, linted and logged at the wall.
// usage: node observer/observe.mjs [--backend claude|gemini]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cross, wall } from '../lib/wall.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const env = Object.fromEntries((fs.existsSync(ROOT + '.env') ? fs.readFileSync(ROOT + '.env', 'utf8') : '')
  .split('\n').filter((l) => /^[A-Z_]+=./.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const argBackend = process.argv.includes('--backend') ? process.argv[process.argv.indexOf('--backend') + 1] : null;
const backend = argBackend || (env.GEMINI_API_KEY && env.GEMINI_MODEL ? 'gemini' : 'claude');
const VIDEO = ROOT + 'prepared/validate.webm';
const LOGTXT = fs.readFileSync(ROOT + 'prepared/validate-log.txt', 'utf8');
const OUT = ROOT + 'runs/spec.json';

const PROMPT = `You are the OBSERVER in a clean-room rebuild. You are shown a short screen recording of someone using an old
business web app (frames in order), plus the plain-text log the app printed at the end. Write a BEHAVIORAL SPEC of
this one screen that a developer who never sees the app could rebuild from.

Rules (a linter enforces them; violations are rejected):
- Behavior only: screens, fields, user actions, results, validation rules, data the rules depend on.
- Do NOT name the product or vendor. No screenshots, no images, no source code, no file paths, no URLs.
- You MAY quote the short user-visible messages exactly as they appear (they are behavior).
- Mark every rule "observed" (you saw it fire) or "inferred" (you believe it exists from patterns; say why).
  Inferred rules are valuable: think about which situations the recording did NOT exercise (e.g. data that was
  present, or relationships between people on the claim) and what the app would likely check then.
- Note ordering and quirks of the log exactly (e.g. truncated lines).

Return ONLY one JSON object, no prose, with keys:
  "screen": {"name","purpose","layout":[...]},
  "data_model": {...},
  "interactions": [{"step","action","result","status"}],
  "validation_rules": [{"id":"R01","when","message","status"}],
  "output_format": "..."`;

function extractFrames(dir) {
  execFileSync('ffmpeg', ['-v', 'error', '-i', VIDEO, '-vf', 'fps=1.5,scale=1366:-1', path.join(dir, 'frame_%02d.png')]);
  return fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
}

function parseJson(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('observer returned no JSON:\n' + text.slice(0, 500));
  return JSON.parse(text.slice(s, e + 1));
}

async function viaClaude() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-'));
  const frames = extractFrames(dir);
  fs.writeFileSync(path.join(dir, 'end-of-run-log.txt'), LOGTXT);
  const prompt = `${PROMPT}\n\nRead these files in this folder, in order: ${frames.join(', ')}, then end-of-run-log.txt.`;
  const r = spawnSync('/opt/homebrew/bin/claude', ['-p', prompt, '--allowedTools', 'Read', '--disallowedTools', 'Bash,WebFetch,WebSearch,Write,Edit', '--output-format', 'text'],
    { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 15 * 60 * 1000 });
  if (r.status !== 0) throw new Error('claude -p failed: ' + (r.stderr || r.stdout).slice(0, 800));
  return { spec: parseJson(r.stdout), model: 'claude (claude -p)', inputs: frames.length + ' frames + log text' };
}

async function viaGemini() {
  const body = { contents: [{ parts: [
    { inline_data: { mime_type: 'video/webm', data: fs.readFileSync(VIDEO).toString('base64') } },
    { text: PROMPT + '\n\nEnd-of-run log text:\n' + LOGTXT },
  ] }], generationConfig: { responseMimeType: 'application/json' } };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) throw new Error(`gemini ${res.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return { spec: parseJson(j.candidates[0].content.parts.map((p) => p.text || '').join('')), model: env.GEMINI_MODEL, inputs: 'video + log text' };
}

const t0 = Date.now();
const { spec, model, inputs } = backend === 'gemini' ? await viaGemini() : await viaClaude();
spec.observer = { model, inputs, when: new Date().toISOString() };
fs.mkdirSync(ROOT + 'runs', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(spec, null, 2));
const rules = spec.validation_rules || [];
cross(OUT, `observer(${model})`, 'builder', { rules: rules.length, observed: rules.filter((r) => /^observed/.test(r.status)).length, inferred: rules.filter((r) => /^inferred/.test(r.status)).length });
console.log(`spec.json: ${rules.length} rules (${Math.round((Date.now() - t0) / 1000)} s, ${model})`);
