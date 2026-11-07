// Verifier: serves a build, replays the recorded interaction (select claim → generate claim file → validate
// only → read log) for each scenario, scores by RULE (meaning, not exact string), and measures line-level match
// with the original recording's log. Writes runs/runN/score.json and a behavior-only feedback.json that crosses
// the wall (feedback rules + recorded lines only; held-out rules never cross).
// usage: node verifier/verify.mjs <N>      (or: node verifier/verify.mjs --dir <folder>)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { RULES, SCENARIOS, PROBES } from './rules.mjs';
import { cross, wall } from '../lib/wall.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argDir = process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir') + 1] : null;
const N = argDir ? null : Number(process.argv[2] || 1);
const DIR = argDir || `${ROOT}runs/run${N}`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const server = http.createServer((req, res) => {
  const f = path.join(DIR, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!f.startsWith(DIR) || !fs.existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }).end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, recordVideo: { dir: DIR + '/video' } });
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
page.on('dialog', (d) => d.accept().catch(() => {}));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

async function setField(name, value) {
  const el = page.locator(`[name="${name}"]`).first();
  if (!(await el.count())) return `no field ${name}`;
  const tag = await el.evaluate((e) => e.tagName.toLowerCase());
  if (tag === 'select') await el.selectOption(value); else await el.fill(value);
  await el.dispatchEvent('change').catch(() => {});
  return null;
}

async function replay(setup) {
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(200);
  const notes = [];
  for (const [k, v] of Object.entries(setup)) { const n = await setField(k, v); if (n) notes.push(n); }
  await page.locator('input[type="checkbox"][name^="claims"]').first().check({ timeout: 4000 });
  const toggle = page.locator('#gen-toggle');
  if (await toggle.count() && !(await page.locator('#btn-x12').isVisible())) await toggle.click();
  await page.locator('#btn-x12').click({ timeout: 4000 });
  await page.locator('#btn-validate').click({ timeout: 4000 });
  await page.waitForTimeout(300);
  const vl = page.locator('#view-log');
  if (await vl.count() && await vl.isVisible()) await vl.click().catch(() => {});
  await page.waitForTimeout(200);
  return { text: await page.locator('#log').innerText({ timeout: 4000 }), notes };
}

const norm = (l) => l.toLowerCase().replace(/\*+/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const recorded = fs.readFileSync(ROOT + 'prepared/validate-log.txt', 'utf8').split('\n').filter((l) => l.startsWith('***'))
  .flatMap((l) => l.split(/(?=\*\*\* )/)).map((l) => l.trim()).filter(Boolean);

const logs = {}; const notes = {};
for (const [name, setup] of Object.entries(SCENARIOS)) {
  try { const r = await replay(setup); logs[name] = r.text; notes[name] = r.notes; }
  catch (e) { logs[name] = ''; notes[name] = ['replay failed: ' + e.message.split('\n')[0]]; }
  fs.writeFileSync(`${DIR}/log-${name}.txt`, logs[name]);
  log(`scenario ${name}: ${logs[name].split('\n').filter((l) => l.includes('***')).length} *** lines ${notes[name].length ? '(' + notes[name].join('; ') + ')' : ''}`);
}
await context.tracing.stop({ path: DIR + '/verifier-trace.zip' });
await context.close(); await browser.close(); server.close();

const results = RULES.map((r) => ({ id: r.id, set: r.set, scenario: r.scenario, name: r.name, green: !!logs[r.scenario] && r.test(logs[r.scenario]) }));
const fx = logs.fixture.split('\n').flatMap((l) => l.split(/(?=\*\*\* )/)).map(norm);
const matched = recorded.filter((l) => fx.includes(norm(l)));
const missing = recorded.filter((l) => !fx.includes(norm(l)));
// Behavioral equivalence: every *** line the original produced in each scenario, found in the rebuild's log.
const gtLines = (f) => fs.readFileSync(ROOT + 'verifier/ground-truth/' + f + '.txt', 'utf8').split('\n').filter((l) => l.startsWith('***'))
  .flatMap((l) => l.split(/(?=\*\*\* )/)).map((l) => l.trim()).filter(Boolean);
const equiv = {}; const diffs = {};
const myLines = (sc) => (logs[sc] || '').split('\n').flatMap((l) => l.split(/(?=\*\*\* )/)).map((l) => l.trim()).filter((l) => l.startsWith('***'));
for (const sc of Object.keys(SCENARIOS)) {
  const mine = myLines(sc), gt = gtLines(sc);
  const missing = gt.filter((l) => !mine.map(norm).includes(norm(l))), extra = mine.filter((l) => !gt.map(norm).includes(norm(l)));
  diffs[sc] = { setup: SCENARIOS[sc], original: gt, missing, extra, exact: !missing.length && !extra.length };
  equiv[sc] = `${gt.length - missing.length}/${gt.length}${extra.length ? ` +${extra.length} extra` : ''}`;
}
const cnt = (s) => `${results.filter((r) => r.set === s && r.green).length}/${results.filter((r) => r.set === s).length}`;
const score = { run: N, dir: DIR, when: new Date().toISOString(), feedback: cnt('feedback'), heldout: cnt('heldout'), recording_match: `${matched.length}/${recorded.length}`, equivalence: equiv, probes_exact: `${PROBES.filter((p) => diffs[p].exact).length}/${PROBES.length}`, heldout_exact: `${['P','N'].filter((p) => diffs[p].exact).length}/2`, page_errors: errors.slice(0, 5), results, notes };
fs.writeFileSync(`${DIR}/score.json`, JSON.stringify(score, null, 2));

console.log('\nRULE  SET       SCEN     RESULT  NAME');
for (const r of results) console.log(`${r.id.padEnd(5)} ${r.set.padEnd(9)} ${r.scenario.padEnd(8)} ${r.green ? 'GREEN ' : 'RED   '}  ${r.name}`);
console.log(`\nfeedback: ${score.feedback}   held-out: ${score.heldout}   recording match: ${score.recording_match}   probes exact: ${score.probes_exact}   equivalence: ${JSON.stringify(equiv)}`);

if (N) { // behavior-only feedback for the next run
  const fb = {
    from: 'verifier', run: N, summary: `feedback rules ${score.feedback}; ${matched.length} of ${recorded.length} recorded log lines reproduced`,
    failed_rules: RULES.filter((r) => r.set === 'feedback' && !results.find((x) => x.id === r.id).green).map((r) => ({ id: r.id, behavior: r.behavior })),
    recorded_lines_missing: missing,
    probes: PROBES.map((p) => ({ probe: p, claim_data_changes: diffs[p].setup, original_app_printed: diffs[p].original, your_build_missed: diffs[p].missing, your_build_added: diffs[p].extra, exact_match: diffs[p].exact })),
    replay_problems: Object.values(notes).flat(),
    heldout_checks_passed: score.heldout,
    note: 'Held-out checks replay the same flow on claim data the recording did not show. Only their pass count crosses the wall; which checks failed is not disclosed.',
  };
  fs.writeFileSync(`${DIR}/feedback.json`, JSON.stringify(fb, null, 2));
  cross(`${DIR}/feedback.json`, 'verifier', 'builder', { run: N, feedback: score.feedback });
  wall({ from: 'verifier', to: 'scoreboard', run: N, feedback: score.feedback, heldout: score.heldout, recording_match: score.recording_match });
}
