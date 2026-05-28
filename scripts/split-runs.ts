#!/usr/bin/env bun
// Reads the iterate-prompt VERBOSE log and splits each fixture's FINAL TEXT
// into a standalone markdown file under tmp-iterate-runs/.
import { readFileSync, writeFileSync } from "fs";

const log = readFileSync("tmp-iterate-runs/all-fixtures.log", "utf-8");

// Find every `=== <id>: "..." ===` header + the following FINAL TEXT block.
const fixtureRe = /=== ([a-z-]+): "([^"]+)"…? ===([\s\S]*?)(?===|========== SUMMARY)/g;
let m: RegExpExecArray | null;
while ((m = fixtureRe.exec(log)) !== null) {
  const id = m[1];
  const question = m[2];
  const body = m[3];

  const finalMatch = body.match(/--- FINAL TEXT ---\n([\s\S]*?)(?=\n\n========== SUMMARY|\n\n=== |$)/);
  if (!finalMatch) continue;

  // Strip the "  | " prefix from each line
  const finalText = finalMatch[1]
    .split("\n")
    .map(line => line.replace(/^\s*\|\s?/, ""))
    .join("\n")
    .trim();

  const passRe = new RegExp(`\\[${id}\\] run 1/1\\u2026 (✓|✗)`);
  const passMatch = log.match(passRe);
  const pass = passMatch ? passMatch[1] === "✓" : false;

  const out = `# Fixture: ${id} ${pass ? "✅" : "❌"}

**Frage:** ${question}

---

${finalText}
`;
  const fname = `tmp-iterate-runs/answer-${id}.md`;
  writeFileSync(fname, out);
  console.log(`wrote ${fname}`);
}
