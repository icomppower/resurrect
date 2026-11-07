// Builds the visuals for the 1-minute video: three title cards (PNG) and a recording of the rebuilt app (run 5).
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = ROOT + 'video/out/';
const spec = JSON.parse(fs.readFileSync(ROOT + 'runs/spec.json', 'utf8'));
const rules = spec.validation_rules;
const seen = rules.filter((r) => /^observed/.test(r.status)).length, guessed = rules.filter((r) => /^inferred/.test(r.status)).length;
const scores = fs.readdirSync(ROOT + 'runs').filter((d) => /^run\d+$/.test(d)).map((d) => +d.slice(3)).sort((a, b) => a - b)
  .map((n) => ({ n, ...JSON.parse(fs.readFileSync(`${ROOT}runs/run${n}/score.json`, 'utf8')) }));
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(OUT + f).toString('base64');

const CSS = `body{margin:0;width:1280px;height:720px;background:#0f1419;color:#e8edf2;font-family:-apple-system,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 72px;box-sizing:border-box}
h1{font-size:44px;margin:0 0 12px} .sub{color:#8fa3b8;font-size:24px;margin-bottom:28px} .g{color:#7ee787} .y{color:#f2cc60} .r{color:#ff7b72}`;
const scene2 = `<style>${CSS}.row{display:flex;gap:28px;align-items:stretch}.box{background:#18212b;border-radius:14px;padding:22px 26px;flex:1;font-size:19px;line-height:1.5}.wall{width:14px;background:repeating-linear-gradient(45deg,#f2cc60 0 10px,#0f1419 10px 20px);border-radius:6px}.t{font-size:15px;color:#8fa3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px}</style>
<h1>Recording → <span class="g">${rules.length} rules</span> → new app</h1><div class="sub">${seen} seen happen · ${guessed} guessed · nothing else crosses the wall</div>
<div class="row"><div class="box"><div class="t">Claude watches the recording</div>
• No policy number → flagged <span class="g">(seen)</span><br>• Procedure not linked to a diagnosis → flagged <span class="g">(seen)</span><br>• Payer has no ID → flagged <span class="g">(seen)</span><br>• Patient isn't the insurance holder → patient birth date, sex, address required <span class="y">(guessed)</span></div>
<div class="wall"></div><div class="box"><div class="t">Claude Code builds — isolated</div>Gets only the rule list + the claim data.<br>No screenshots · no code · no text from the old app.<br>Every handoff hashed and logged in <b>wall.log</b>.</div></div>`;
const bars = scores.map((s) => { const h = +s.heldout.split('/')[0]; return `<div class="col"><div class="bar" style="height:${30 + h * 70}px;background:${h ? '#7ee787' : '#ff7b72'}"></div><div class="v">${s.heldout}</div><div class="l">run ${s.n}</div></div>`; }).join('');
const scene4 = `<style>${CSS}.chart{display:flex;gap:46px;align-items:flex-end;height:360px;margin-top:10px}.col{text-align:center}.bar{width:110px;border-radius:10px 10px 0 0}.v{font-size:30px;font-weight:700;margin-top:10px}.l{color:#8fa3b8;font-size:20px}</style>
<h1>Hidden tests passed, run over run</h1><div class="sub">Checked against the real 2018 app · every run also matches the recording <span class="g">${scores.at(-1).recording_match}</span></div><div class="chart">${bars}</div>`;
const scene5 = `<style>${CSS}body{flex-direction:row;align-items:center;gap:40px}.ph{height:640px;border-radius:22px;box-shadow:0 0 0 3px #2b3640}.txt{flex:1}</style>
<div class="txt"><h1>A human makes the call</h1><div class="sub">In ASI:One (Fetch.ai): the old app accepted <b>ABCDEFGHIJ</b> as a doctor's ID.<br><br>Copy the old bug, or keep the fix?<br><br><span class="g">Logged in wall.log.</span></div></div>
<img class="ph" src="${b64('asi-card.png')}"><img class="ph" src="${b64('asi-logged.png')}">`;

const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const [name, html] of [['card2', scene2], ['card4', scene4], ['card5', scene5]]) {
  await pg.setContent(html); await pg.screenshot({ path: OUT + name + '.png' });
}
await pg.close();

// Scene 3: drive the rebuilt app (run 5) with visible click rings.
const DIR = ROOT + 'runs/run5';
const srv = http.createServer((q, r) => r.end(fs.readFileSync(path.join(DIR, 'index.html')))).listen(0);
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: OUT + 'rec', size: { width: 1280, height: 720 } } });
const p = await ctx.newPage();
await p.goto(`http://127.0.0.1:${srv.address().port}/`);
await p.addStyleTag({ content: '.ring{outline:4px solid #ff4d4d!important;outline-offset:3px;border-radius:6px}' });
const click = async (sel, act = 'click', v) => { const el = p.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await el.evaluate((e) => e.classList.add('ring')); await p.waitForTimeout(700); if (act === 'check') await el.check(); else if (act === 'select') await el.selectOption(v); else await el.click(); await p.waitForTimeout(250); await el.evaluate((e) => e.classList.remove('ring')).catch(() => {}); };
await p.waitForTimeout(800);
await click('input[type="checkbox"][name^="claims"]', 'check');
if (await p.locator('#gen-toggle').count() && !(await p.locator('#btn-x12').isVisible())) await click('#gen-toggle');
await click('#btn-x12');
await click('#btn-validate');
await p.waitForTimeout(400);
if (await p.locator('#view-log').isVisible()) await click('#view-log');
await p.locator('#log').scrollIntoViewIfNeeded(); await p.waitForTimeout(2200);
await click('[name="insured.relationship"]', 'select', 'child');
await click('input[type="checkbox"][name^="claims"]', 'check').catch(() => {});
if (await p.locator('#gen-toggle').count() && !(await p.locator('#btn-x12').isVisible())) await click('#gen-toggle');
await click('#btn-x12');
await click('#btn-validate');
await p.waitForTimeout(400);
if (await p.locator('#view-log').isVisible()) await click('#view-log');
await p.locator('#log').evaluate((e) => { e.scrollTop = e.scrollHeight; }).catch(() => {});
await p.locator('#log').scrollIntoViewIfNeeded(); await p.waitForTimeout(2500);
const vid = await p.video().path();
await ctx.close(); await browser.close(); srv.close();
fs.renameSync(vid, OUT + 'app.webm');
console.log('visuals ok');
