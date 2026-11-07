"""Resurrect Verifier as a Fetch.ai uAgent (Agentverse mailbox + Agent Chat Protocol), so the whole workflow can be
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
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, TextContent, chat_protocol_spec

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
agent = Agent(name="resurrect-verifier", seed=os.environ["AGENT_SEED"], port=8001, mailbox=True)
chat = Protocol(spec=chat_protocol_spec)
BUSY = {"job": None}


def runs():
    return sorted([int(p.name[3:]) for p in (ROOT / "runs").glob("run[0-9]*") if (p / "index.html").exists()])


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
    if "loop" in text or "rebuild" in text:
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
    else:
        rs = runs()
        head = ("Resurrect rebuilds an old app's screen clean-room from a recording, then proves behavior against the original. "
                "Say `loop` to run the next rebuild, `verify N` to re-check a run, `wall` for the clean-room log.\n\n")
        await reply(ctx, sender, head + ("\n\n".join(card(n) for n in rs) if rs else "No runs yet."))


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
