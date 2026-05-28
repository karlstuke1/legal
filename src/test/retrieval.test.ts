import { describe, it, expect } from "vitest";
import { resolveProviders } from "@/lib/retrieval";

describe("resolveProviders", () => {
  it("returns AT-only providers for AT jurisdiction", () => {
    const providers = resolveProviders({
      jurisdiction: ["AT"],
      sources: ["AUTO"],
      autoRouter: true,
    });
    expect(providers).toContain("RIS");
    expect(providers).toContain("FINDOK");
  });

  it("respects manual source selection when autoRouter is off", () => {
    const providers = resolveProviders({
      jurisdiction: ["AT"],
      sources: ["RIS"],
      autoRouter: false,
    });
    expect(providers).toEqual(["RIS"]);
  });

  it("adds PARLAMENT only for parliamentary queries", () => {
    const providers = resolveProviders(
      { jurisdiction: ["AT"], sources: ["AUTO"], autoRouter: true },
      "Regierungsvorlage zum Mietrecht"
    );
    expect(providers).toContain("PARLAMENT");
  });

  it("does not add PARLAMENT for regular queries", () => {
    const providers = resolveProviders(
      { jurisdiction: ["AT"], sources: ["AUTO"], autoRouter: true },
      "Schadenersatz ABGB"
    );
    expect(providers).not.toContain("PARLAMENT");
  });

  it("returns fallback providers when no jurisdiction matches", () => {
    const providers = resolveProviders({
      jurisdiction: [],
      sources: ["AUTO"],
      autoRouter: true,
    });
    expect(providers.length).toBeGreaterThan(0);
  });
});
