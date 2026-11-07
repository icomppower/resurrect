"""Round-trip test of the Resurrect Verifier agent through Agentverse (same path ASI:One uses).
usage: ~/fetch-hello/.venv/bin/python agent/chat_test.py "status" [timeout_s]"""
import asyncio, queue, sys, threading, time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4
from uagents.registration import AlmanacApiRegistrationPolicy
from uagents_core.contrib.protocols.chat import ChatAcknowledgement, ChatMessage, TextContent, chat_protocol_spec
from uagents_core.envelope import Envelope
from uagents_core.identity import Identity
from uagents_core.types import AgentEndpoint
from uagents_core.utils.messages import parse_envelope, send_message_to_agent

TARGET = "agent1qd2g8tfg3xfjmmnddlmz75rr5znealnttkataz58tjhxwh2hqs6txsgclsl"
PORT = 8004
me = Identity.from_seed("resurrect-chat-test-client-2026-11-07", 0)
inbox = queue.Queue()


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        env = Envelope.model_validate_json(raw)
        inbox.put((env.sender, parse_envelope(env, {ChatMessage, ChatAcknowledgement})))
        self.send_response(200); self.end_headers(); self.wfile.write(b"{}")


text, timeout = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 60
threading.Thread(target=ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever, daemon=True).start()
asyncio.run(AlmanacApiRegistrationPolicy().register(me.address, me, [chat_protocol_spec.digest], [AgentEndpoint(url=f"http://localhost:{PORT}/submit", weight=1)]))
t0 = time.time()
send_message_to_agent(TARGET, ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(), content=[TextContent(type="text", text=text)]), me)
print(f"SENT {text!r}", flush=True)
while time.time() - t0 < timeout:
    try: sender, msg = inbox.get(timeout=1)
    except queue.Empty: continue
    if isinstance(msg, ChatAcknowledgement): print(f"{time.time()-t0:5.1f}s ACK"); continue
    send_message_to_agent(TARGET, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id), me)
    print(f"{time.time()-t0:5.1f}s REPLY:\n" + "\n".join(c.text for c in msg.content if isinstance(c, TextContent)), flush=True)
    if "Starting" not in msg.content[0].text and "Replaying" not in msg.content[0].text: break
