import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractMessageContent,
  openRouterChatCompletion,
  parseJsonObject,
  strictJsonSchema,
} from "../../supabase/functions/_shared/openrouter";

const runLive = process.env.LIVE_SOURCE_TESTS === "1";
const liveDescribe = runLive ? describe : describe.skip;

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  if (!line) return undefined;
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

liveDescribe("live source hardening smoke tests", () => {
  it("resolves § 75 StGB to a direct RIS norm page, not an Ergebnis search page", async () => {
    const url = "https://www.ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002296&Paragraf=75";
    expect(url).not.toContain("Ergebnis.wxe");

    const resp = await fetch(url);
    expect(resp.ok).toBe(true);
    const html = await resp.text();
    expect(html).toMatch(/Strafgesetzbuch|StGB/);
    expect(html.replace(/&#167;|&sect;/g, "§")).toMatch(/§\s*75/);
  }, 20_000);

  it("OpenRouter verifier smoke rejects a fabricated hard citation", async () => {
    const apiKey = localEnv("OPENROUTER_API_KEY");
    expect(apiKey, "OPENROUTER_API_KEY must be set in env or .env.local for live smoke tests").toBeTruthy();

    const responseFormat = strictJsonSchema("live_verify_smoke", {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["supported", "unsupported"] },
        invalid_citations: { type: "array", items: { type: "string" } },
        repair_instruction: { type: "string" },
      },
      required: ["verdict", "invalid_citations", "repair_instruction"],
      additionalProperties: false,
    });

    const resp = await openRouterChatCompletion({
      apiKey,
      model: localEnv("OPENROUTER_MODEL_HIGH_QUALITY") || "openai/gpt-5.5",
      messages: [
        {
          role: "system",
          content: "Du bist ein strenger Quellenprüfer. Harte Zitate wie Aktenzeichen sind nur gültig, wenn sie in der Quellenliste ausdrücklich vorkommen. Antworte strikt nach Schema.",
        },
        {
          role: "user",
          content: `Quellenliste:
[Quelle 1] RIS Strafgesetzbuch § 75. Enthält keine OGH-Geschäftszahl.

Antwortentwurf:
Mord ist in § 75 StGB geregelt. Siehe OGH 99 Ob 999/99x [Quelle 1].

Prüfe, ob die harte Geschäftszahl von der Quelle gedeckt ist.`,
        },
      ],
      responseFormat,
      reasoningEffort: "low",
      requireParameters: true,
      maxTokens: 800,
    });

    expect(resp.ok).toBe(true);
    const data = await resp.json();
    const parsed = parseJsonObject(extractMessageContent(data));
    expect(parsed.verdict).toBe("unsupported");
    expect(parsed.invalid_citations.join(" ")).toMatch(/99\s*Ob\s*999\/99x/i);
  }, 60_000);
});
