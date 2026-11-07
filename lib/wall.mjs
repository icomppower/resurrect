// The wall: every artifact that crosses from the dirty room (Observer/Verifier) to the clean room (Builder) is
// linted here and appended to wall.log. Rejects product names, source code, file paths and images.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const WALL_LOG = fileURLToPath(new URL('../wall.log', import.meta.url));
const BANNED = [
  [/openemr/i, 'product name'],
  [/\.php\b|src\/|interface\//i, 'source path'],
  [/<\?php|\bfunction\s*\(|\$[a-z_]+\s*=|SELECT\s+.+\s+FROM/i, 'source code'],
  [/data:image|\.png\b|\.jpe?g\b|[A-Za-z0-9+/]{120,}={0,2}/, 'image or binary'],
  [/X12_5010|Claim\.php|cptCharges|NPIValid/i, 'source identifier'],
];

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

export function lint(text) {
  const hits = BANNED.filter(([re]) => re.test(text)).map(([, why]) => why);
  return { ok: hits.length === 0, hits };
}

export function wall(entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  fs.appendFileSync(WALL_LOG, line + '\n');
  return line;
}

// Lint a file that is about to cross; throws (and logs the rejection) if it fails.
export function cross(file, from, to, extra = {}) {
  const buf = fs.readFileSync(file);
  const res = lint(buf.toString('utf8'));
  wall({ from, to, artifact: file.split('/').pop(), bytes: buf.length, sha256: sha256(buf), linter: res.ok ? 'PASSED' : 'REJECTED', ...(res.ok ? {} : { reasons: res.hits }), ...extra });
  if (!res.ok) throw new Error(`wall REJECTED ${file}: ${res.hits.join(', ')}`);
  return buf;
}
