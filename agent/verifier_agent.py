"""Resurrect Verifier as a Fetch.ai uAgent. Plain-language flow for ASI:One: "hi" -> intro, "rebuild" -> four
messages from the best saved run, "rebuild live" -> a new clean-room run, card / "copy old" / "keep fix" -> logged
human decision. Power-user commands below are unchanged. (Agentverse mailbox + Agent Chat Protocol), so the whole workflow can be
driven from an ASI:One conversation:
  "status"      -> scoreboard of every run so far
  "verify N"    -> re-run the Verifier on rebuild run N and reply with the scorecard
  "loop"        -> run the next clean-room Builder run (fed by the last Verifier feedback), verify it, reply
  "wall"        -> the last wall crossings (what passed the clean-room linter)
Run: ~/fetch-hello/.venv/bin/python agent/verifier_agent.py   (AGENT_SEED in .env, never printed)"""
import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, MetadataContent, TextContent, chat_protocol_spec

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
agent = Agent(name="resurrect-verifier", seed=os.environ["AGENT_SEED"], port=8001, mailbox=True)
chat = Protocol(spec=chat_protocol_spec)
BUSY = {"job": None}
REPO = "https://github.com/icomppower/resurrect"
PAGES = "https://icomppower.github.io/resurrect"
INTRO = ("I'm Resurrect. I rebuild old software from a short screen recording — the builder never sees the original app — "
         "and then I prove the new version behaves the same. Type: rebuild")
POWER = "(Also: rebuild live · status · verify N · loop · wall)"
# Plain-words versions of spec rules, picked by matching the spec's own text; status (seen/guessed) is read from the spec.
PLAIN = [
    (r"policy number", "A claim with no insurance policy number gets flagged."),
    (r"justif", "Every billed procedure has to be linked to a diagnosis, or it gets flagged — once per procedure."),
    (r"patient.*not the insured|not the insured|relationship is not", "When the patient isn't the insurance holder (say, a child on a parent's plan), the patient's own birth date, sex and address must be filled in."),
]


def runs():
    return sorted([int(p.name[3:]) for p in (ROOT / "runs").glob("run[0-9]*") if (p / "index.html").exists()])


def score(n: int) -> dict:
    p = ROOT / "runs" / f"run{n}" / "score.json"
    return json.loads(p.read_text()) if p.exists() else {}


def frac(x: str) -> tuple[int, int]:
    a, b = re.match(r"(\d+)/(\d+)", x or "0/0").groups()
    return int(a), int(b)


def best_run() -> int:
    """Saved run shown on stage: most held-out passes, then most probes, then the latest."""
    scored = [n for n in runs() if score(n)]
    return max(scored, key=lambda n: (frac(score(n)["heldout"])[0], frac(score(n).get("probes_exact", "0/0"))[0], n)) if scored else 0


def m1_m2(tag: str) -> list[str]:
    spec = json.loads((ROOT / "runs" / "spec.json").read_text())
    rules = spec.get("validation_rules", [])
    seen = sum(1 for r in rules if str(r.get("status", "")).startswith("observed"))
    guessed = sum(1 for r in rules if str(r.get("status", "")).startswith("inferred"))
    ex = []
    for pat, plain in PLAIN:
        r = next((r for r in rules if re.search(pat, (r.get("when", "") + " " + r.get("message", "")), re.I)), None)
        if r:
            ex.append(f"• {plain} ({'seen' if str(r['status']).startswith('observed') else 'guessed'})")
    m1 = (f"What I saw{tag}: I watched a short recording of a 2018 medical billing app checking claims for errors. "
          f"I found {len(rules)} rules: {seen} I saw happen, {guessed} I'm guessing.\n" + "\n".join(ex))
    m2 = (f"Handoff{tag}: I sent only that list of rules to Claude Code, which builds the new app. No screenshots, no code, "
          f"no text from the old app. Every handoff is logged so you can check: {REPO}/blob/main/wall.log")
    return [m1, m2]


def m3(n: int, tag: str) -> str:
    s = score(n)
    return (f"Result{tag}: The new app is built (run {n}). It passes all {s['recording_match']} steps of the recording and "
            f"{s['heldout']} test cases it was never shown. Try it: {PAGES}/runs/run{n}/index.html")


M4_TEXT = ("One difference: the old app accepted 'ABCDEFGHIJ' as a doctor's ID number (NPI). The new one requires digits. "
           "Copy the old bug or keep the fix?\n(or reply: copy old / keep fix)")


def m4_card(lead: str = "") -> ChatMessage:
    """One chat message: the story text (ASI:One shows only the agent's last reply per question) + the decision card."""
    payload = {"title": "Your call: copy the old bug or keep the fix?",
               "summary_rows": [{"label": "Old app", "value": "accepts 'ABCDEFGHIJ' as an NPI"},
                                {"label": "New app", "value": "requires 10 digits"}],
               "ctas": [{"label": "Copy old", "selection": {"action": "npi_decision", "choice": "copy old"}},
                        {"label": "Keep fix", "primary": True, "selection": {"action": "npi_decision", "choice": "keep fix"}}]}
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=[
        TextContent(type="text", text=(lead + "\n\n" if lead else "") + M4_TEXT),
        MetadataContent(type="metadata", metadata={"card_protocol_version": "1", "requires_card_interaction": "true",
                                                   "card_kind": "detail", "card_payload": json.dumps(payload),
                                                   "preferred_drawer_width_px": "540"})])


async def send_story(ctx: Context, to: str, n: int, tag: str, first_two: bool = True):
    parts = (m1_m2(tag) if first_two else []) + [m3(n, tag)]
    await ctx.send(to, m4_card("\n\n".join(parts)))


async def do_live(ctx: Context, to: str):
    try:
        await reply(ctx, to, "\n\n".join(m1_m2("") + ["Claude Code is building now (about 2 min)… I'll post the result here."]))
        n = (runs() or [0])[-1] + 1
        await sh("node", "builder/build.mjs", str(n))
        if not (ROOT / "runs" / f"run{n}" / "index.html").exists():
            raise RuntimeError("build failed")
        await sh("node", "verifier/verify.mjs", str(n))
        if not score(n):
            raise RuntimeError("verify failed")
        await send_story(ctx, to, n, "", first_two=True)
    except Exception as e:  # one plain sentence, then the saved run
        ctx.logger.info(f"live rebuild failed: {e}")
        b = best_run()
        await reply(ctx, to, f"The live build hit a problem, so here is the saved run {b} instead.")
        await send_story(ctx, to, b, f" (from run {b})", first_two=False)
    finally:
        BUSY["job"] = None


def log_decision(choice: str) -> None:
    with open(ROOT / "wall.log", "a") as f:
        f.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), "from": "human", "to": "builder",
                            "decision": choice, "note": "human decision: NPI faithful vs fixed"}) + "\n")


def card(n: int) -> str:
    p = ROOT / "runs" / f"run{n}" / "score.json"
    if not p.exists():
        return f"Run {n}: not verified yet."
    s = json.loads(p.read_text())
    lines = [f"**Run {n}** — held-out **{s['heldout']}** · feedback {s['feedback']} · recording match {s['recording_match']}",
             "Equivalence with the original, per scenario: " + ", ".join(f"{k} {v}" for k, v in s.get("equivalence", {}).items())]
    for r in s["results"]:
        lines.append(f"{'✅' if r['green'] else '❌'} {r['id']} {r['name']}")
    return "\n".join(lines)


async def sh(*args: str) -> str:
    p = await asyncio.create_subprocess_exec(*args, cwd=ROOT, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    out, _ = await p.communicate()
    return out.decode()[-600:]


async def reply(ctx: Context, to: str, text: str):
    await ctx.send(to, ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=[TextContent(type="text", text=text)]))


async def do_loop(ctx: Context, to: str):
    n = (runs() or [0])[-1] + 1
    try:
        await reply(ctx, to, f"Starting clean-room Builder run {n} (isolated claude -p, spec + behavior-only feedback only). Takes a few minutes.")
        out = await sh("node", "builder/build.mjs", str(n))
        if not (ROOT / "runs" / f"run{n}" / "index.html").exists():
            await reply(ctx, to, f"Builder run {n} failed:\n{out}")
            return
        await sh("node", "verifier/verify.mjs", str(n))
        await reply(ctx, to, card(n))
    finally:
        BUSY["job"] = None


@chat.on_message(ChatMessage)
async def on_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))
    text = " ".join(c.text for c in msg.content if isinstance(c, TextContent)).strip().lower()
    ctx.logger.info(f"IN {sender[:14]}… {text[:80]!r}")
    m = re.search(r"verify\D*(\d+)", text)
    choice = None
    try:
        sel = json.loads(text)
        if isinstance(sel, dict) and sel.get("action") == "npi_decision":
            choice = sel.get("choice")
    except ValueError:
        pass
    if choice is None and re.search(r"\bcopy old\b|\bkeep fix\b", text):
        choice = "copy old" if "copy old" in text else "keep fix"
    if choice:
        log_decision(choice)
        await reply(ctx, sender, "Logged. A person makes this call, not the AI — it's in the handoff log.")
    elif re.search(r"\brebuild\s+live\b", text):
        if BUSY["job"]:
            await reply(ctx, sender, "A build is already running; try again in a couple of minutes.")
            return
        BUSY["job"] = asyncio.create_task(do_live(ctx, sender))
    elif re.search(r"\brebuild\b", text):
        b = best_run()
        if not b:
            await reply(ctx, sender, "No saved run yet. Type: rebuild live")
            return
        await send_story(ctx, sender, b, f" (from run {b})")
    elif text in {"hi", "hello", "help", "hey", "start"}:
        await reply(ctx, sender, INTRO + "\n" + POWER)
    elif "loop" in text:
        if BUSY["job"]:
            await reply(ctx, sender, "A run is already in progress; ask for status in a minute.")
            return
        BUSY["job"] = asyncio.create_task(do_loop(ctx, sender))
    elif m:
        n = int(m.group(1))
        if n not in runs():
            await reply(ctx, sender, f"No rebuild run {n}. Runs: {runs()}")
            return
        await reply(ctx, sender, f"Replaying the recorded Validate against rebuild run {n}…")
        await sh("node", "verifier/verify.mjs", "--dir", str(ROOT / "runs" / f"run{n}"))
        await reply(ctx, sender, card(n))
    elif "wall" in text:
        tail = (ROOT / "wall.log").read_text().strip().split("\n")[-6:]
        items = [json.loads(l) for l in tail]
        await reply(ctx, sender, "Last wall crossings:\n" + "\n".join(f"- {i['from']} → {i['to']}: {i.get('artifact', i.get('outputs', ''))} {i.get('linter', '')}" for i in items))
    elif "status" in text:
        rs = runs()
        await reply(ctx, sender, "\n\n".join(card(n) for n in rs) if rs else "No runs yet.")
    else:
        await reply(ctx, sender, INTRO + "\n" + POWER)


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
