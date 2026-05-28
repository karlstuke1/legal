import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Runtime-crash guards for SourcesPanel.
 *
 * Background: PR #14 shipped a crash ("Tooltip is not defined") because
 * we removed the Tooltip import when deleting the collapsed-strip branch
 * but left a <Tooltip> usage inside the nested ProviderGroup component
 * down the file. tsc didn't catch it (noImplicitAny: false lets
 * undefined JSX identifiers slip by) and neither did ESLint (no
 * react/jsx-no-undef rule enabled in eslint.config.js).
 *
 * These tests act as a domain-specific jsx-no-undef: for every JSX tag
 * that starts with an uppercase letter and appears in SourcesPanel.tsx,
 * there must be a matching import. Catches the same class of regression
 * fast, without needing to add an ESLint plugin.
 */
describe("SourcesPanel — every JSX component tag has a matching import", () => {
  const source = readFileSync(
    resolve(__dirname, "../components/SourcesPanel.tsx"),
    "utf8",
  );

  // Gather every uppercase JSX tag actually used in JSX position.
  // Matches `<Component` and `<Component.Sub` (we key on the root
  // identifier only — `HoverCard.Trigger` needs `HoverCard` imported).
  const tagMatches = Array.from(
    source.matchAll(/<([A-Z][A-Za-z0-9]*)(?:\.[A-Z][A-Za-z0-9]*)?[\s>/]/g),
  );
  const usedTags = new Set(tagMatches.map((m) => m[1]));

  // Identifiers that are in scope — either imported from elsewhere OR
  // declared locally in this file (module-level function / const / class).
  const knownIdentifiers = new Set<string>();
  for (const m of source.matchAll(/import\s+(?:type\s+)?(?:\*\s+as\s+(\w+)|(\w+)|\{([^}]+)\})\s+from/g)) {
    if (m[1]) knownIdentifiers.add(m[1]); // `import * as X`
    if (m[2]) knownIdentifiers.add(m[2]); // default
    if (m[3]) {
      for (const part of m[3].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, "").trim();
        if (name) knownIdentifiers.add(name);
      }
    }
  }
  // Local declarations — function Foo, const Foo = , class Foo.
  for (const m of source.matchAll(/^\s*(?:export\s+)?(?:function|const|class|let|var)\s+([A-Z][A-Za-z0-9]*)\b/gm)) {
    knownIdentifiers.add(m[1]);
  }

  it("has a non-empty set of JSX tags (sanity check — test isn't silently skipping everything)", () => {
    expect(usedTags.size).toBeGreaterThan(5);
  });

  it("imports every uppercase JSX tag it references (regression guard for 'Tooltip is not defined')", () => {
    // Intrinsics known to be React-native (Fragment is `<></>`, not relevant here).
    const missing = Array.from(usedTags).filter((tag) => !knownIdentifiers.has(tag));
    expect(missing, `SourcesPanel uses these JSX tags but doesn't import them: ${missing.join(", ")}`).toEqual([]);
  });

  it("specifically imports Tooltip / TooltipContent / TooltipTrigger (used by ProviderGroup header)", () => {
    // Explicit canary for the exact bug that triggered the production error screen.
    expect(knownIdentifiers.has("Tooltip")).toBe(true);
    expect(knownIdentifiers.has("TooltipTrigger")).toBe(true);
    expect(knownIdentifiers.has("TooltipContent")).toBe(true);
  });
});
