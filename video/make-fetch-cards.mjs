// Cards for the Fetch.ai video. Every number/line comes from repo files or captured transcripts.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url)); const OUT = ROOT + 'video/out/';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ADDR = 'agent1qd2g8tfg3xfjmmnddlmz75rr5znealnttkataz58tjhxwh2hqs6txsgclsl';
const CSS = `body{margin:0;width:1280px;height:720px;background:#0f1419;color:#e8edf2;font-family:-apple-system,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 72px;box-sizing:border-box}
h1{font-size:46px;margin:0 0 14px}.sub{color:#8fa3b8;font-size:24px;line-height:1.45}.g{color:#7ee787}.y{color:#f2cc60}.b{color:#79c0ff}
.box{background:#18212b;border-radius:14px;padding:18px 22px;font-size:19px;line-height:1.5}.mono{font-family:Menlo,monospace;font-size:15px;line-height:1.55;white-space:pre-wrap;background:#0b0f14;border:1px solid #2b3640;border-radius:12px;padding:18px 22px;color:#c9d1d9}
.tag{display:inline-block;background:#1f6feb33;color:#79c0ff;border-radius:999px;padding:4px 14px;font-size:18px;margin-right:8px}`;
const live = fs.readFileSync(OUT + 'live-transcript.txt', 'utf8').split('\n').filter((l) => /^---|^Result|^Claude Code is building|^What I saw|^Handoff|^One difference/.test(l))
  .map((l) => l.length > 118 ? l.slice(0, 115) + '…' : l).join('\n');
const human = fs.readFileSync(ROOT + 'wall.log', 'utf8').trim().split('\n').filter((l) => l.includes('"from": "human"')).at(-1);
const wallCount = fs.readFileSync(ROOT + 'wall.log', 'utf8').trim().split('\n').length;
const cards = {
  fc01: `<style>${CSS}</style><div><span class="tag">AIE Code Summit · Nov 7 2026</span><span class="tag">Fetch.ai Innovation Lab</span></div><h1 style="font-size:84px;margin-top:26px">Resurrect</h1>
<div class="sub" style="font-size:30px">Rebuild old software from a screen recording —<br>the builder never sees the original — then <span class="g">prove it behaves the same</span>.</div>
<div class="sub" style="margin-top:30px">Drive it from ASI:One: <b style="color:#e8edf2">@resurrect rebuild</b></div>`,
  fc02: `<style>${CSS}.flow{display:flex;align-items:center;gap:14px;margin-top:26px}.n{background:#18212b;border-radius:14px;padding:18px;width:200px;text-align:center;font-size:20px}.n b{display:block;font-size:24px;margin-bottom:6px}.a{color:#8fa3b8;font-size:30px}.wall{width:12px;height:150px;background:repeating-linear-gradient(45deg,#f2cc60 0 10px,#0f1419 10px 20px);border-radius:6px}
.agent{margin-top:34px;border:2px dashed #79c0ff;border-radius:16px;padding:16px 22px;font-size:21px}</style><h1>How it works</h1>
<div class="flow"><div class="n"><b>Recording</b>6 s of the old app</div><div class="a">→</div><div class="n"><b>Claude</b>writes the rules<br><span class="g">seen</span> / <span class="y">guessed</span></div><div class="wall"></div><div class="n"><b>Claude Code</b>builds in an isolated clean room</div><div class="a">→</div><div class="n"><b>Verifier</b>replays + scores vs the real app</div></div>
<div class="agent"><span class="b"><b>Fetch.ai agent</b></span> (Agentverse mailbox · Agent Chat Protocol) wraps the whole loop — talk to it from <b>ASI:One</b>: <b>hi</b> · <b>rebuild</b> · <b>rebuild live</b> · card: <b>Copy old / Keep fix</b></div>`,
  fc08: `<style>${CSS}</style><h1>The Fetch.ai agent</h1><div class="sub" style="margin-bottom:18px">resurrect-verifier · ASI:One handle <b style="color:#e8edf2">@resurrect</b></div>
<div class="mono">Agent(name="resurrect-verifier", mailbox=True)        # Agentverse mailbox
Protocol(spec=chat_protocol_spec)                        # Agent Chat Protocol
address  ${ADDR}

hi            → plain-language intro
rebuild       → story of the best saved run + decision card   (one message)
rebuild live  → new clean-room Claude Code build + Verifier, ~2 min
Copy old / Keep fix (card or text) → human decision appended to wall.log
status · verify N · loop · wall      → power-user commands</div>`,
  fc10: `<style>${CSS}</style><h1>"rebuild live" — real transcript</h1><div class="sub" style="margin-bottom:16px">Through Agentverse, same path ASI:One uses (captured 11:57 AM, Nov 7)</div><div class="mono">${esc(live)}</div>`,
  fc11: `<style>${CSS}.row{display:flex;gap:30px;align-items:center}.c{background:#f4f4f4;color:#111;border-radius:16px;padding:22px 26px;width:470px;font-size:20px}.c b{font-size:22px}.btns{display:flex;gap:12px;margin-top:16px}.btns div{flex:1;text-align:center;padding:12px;border-radius:12px;background:#c8c8c8}.btns div+div{background:#7ef07a}</style>
<h1>A person makes the call</h1><div class="sub" style="margin-bottom:22px">The old app accepts <b style="color:#e8edf2">ABCDEFGHIJ</b> as a doctor's ID (NPI). The rebuild requires digits.</div>
<div class="row"><div class="c"><b>Your call: copy the old bug or keep the fix?</b><div class="btns"><div>Copy old</div><div>Keep fix</div></div></div>
<div style="flex:1"><div class="sub" style="font-size:18px;margin-bottom:8px">wall.log — tapped in ASI:One</div><div class="mono">${esc(human)}</div></div></div>`,
  fc12: `<style>${CSS}</style><h1 style="font-size:60px">Record it. Resurrect rebuilds it — <span class="g">with proof</span>.</h1>
<div class="box" style="margin-top:26px;font-size:22px;line-height:1.8">Code, scores, ${wallCount}-line wall.log: <b class="b">github.com/icomppower/resurrect</b><br>Try the rebuild: <b class="b">icomppower.github.io/resurrect/runs/run5/</b><br>ASI:One: <b>@resurrect rebuild</b><br><span style="font-size:15px;color:#8fa3b8">${ADDR}</span></div>`,
};
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
for (const [k, html] of Object.entries(cards)) { await p.setContent(html); await p.screenshot({ path: OUT + k + '.png' }); }
for (const [f, t] of [['capf3', 'Input: the old app (OpenEMR 5, 2018) — the 6-second recording'], ['capf5', 'wall.log on GitHub — every handoff into the clean room'], ['capf6', 'The rebuild (run 5) — built from the rule list only'], ['capf7', 'README scoreboard — numbers from runs/runN/score.json']]) {
  await p.setContent('<style>html,body{margin:0;background:transparent}div{position:absolute;bottom:0;left:0;right:0;height:64px;background:rgba(0,0,0,.75);color:#fff;font:600 26px -apple-system,Helvetica,sans-serif;display:flex;align-items:center;padding-left:40px}</style><div>' + t + '</div>');
  await p.screenshot({ path: OUT + f + '.png', omitBackground: true });
}
await b.close(); console.log('cards ok');
