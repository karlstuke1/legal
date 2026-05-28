#!/usr/bin/env bun
// Reads the iterate-prompt VERBOSE log and writes one markdown file per
// fixture with the FINAL TEXT + CITE-MATCH ANALYSIS — so the user can
// see both the answer AND the source-to-claim verdict in one place.
import { readFileSync, writeFileSync } from "fs";

const log = readFileSync("tmp-iterate-runs/all-fixtures-v2.log", "utf-8");

const fixtureRe = /=== ([a-z-]+): "([^"]+)"…? ===([\s\S]*?)(?===|========== SUMMARY)/g;
let m: RegExpExecArray | null;
while ((m = fixtureRe.exec(log)) !== null) {
  const id = m[1];
  const question = m[2];
  const body = m[3];

  const finalMatch = body.match(/--- FINAL TEXT ---\n([\s\S]*?)(?=\n\s*--- CITE-MATCH)/);
  const matchMatch = body.match(/--- CITE-MATCH ANALYSIS ---\n([\s\S]*?)(?=\n\n========== SUMMARY|\n\n=== |$)/);
  if (!finalMatch) continue;

  const finalText = finalMatch[1]
    .split("\n")
    .map(line => line.replace(/^\s*\|\s?/, ""))
    .join("\n")
    .trim();

  const matches = matchMatch
    ? matchMatch[1].split("\n").map(l => l.replace(/^\s\s/, "")).join("\n").trim()
    : "(no match analysis)";

  const out = `# ${id}

**Frage:** ${question}

---

## Antwort

${finalText}

---

## Source-to-Claim Verdict

\`\`\`
${matches}
\`\`\`

**Legende:** ✓ score ≥ 0.20 (clear topical match) | ⚠ borderline (0.10–0.20, secondary cite or compound-noun morphology) | ✗ off-topic (score < 0.10 with zero overlap, hard fail).
`;
  const fname = `tmp-iterate-runs/answer-${id}.md`;
  writeFileSync(fname, out);
  console.log(`wrote ${fname}`);
}
