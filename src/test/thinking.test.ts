import { describe, it, expect } from "vitest";
import { generateThinkingSteps, createThinkingController, isDraftIntent } from "@/lib/thinking";
import type { ChatFilters } from "@/lib/types";

const baseFilters: ChatFilters = {
  jurisdiction: ["AT"],
  sources: ["AUTO"],
  mode: "research",
  autoRouter: true,
  legalArea: "allgemein",
};

describe("generateThinkingSteps", () => {
  it("generates research steps with required step IDs", () => {
    const steps = generateThinkingSteps("Was regelt § 1295 ABGB?", baseFilters);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("assess");
    expect(ids).toContain("jurisdiction");
    expect(ids).toContain("search-sources");
    expect(ids).toContain("prepare");
  });

  it("includes file review step when query references a document", () => {
    const steps = generateThinkingSteps("Prüfe dieses Dokument", baseFilters);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("review-file");
  });

  it("does not include file review step for simple queries", () => {
    const steps = generateThinkingSteps("Was ist Verjährung?", baseFilters);
    const ids = steps.map((s) => s.id);
    expect(ids).not.toContain("review-file");
  });

  it("generates simplified steps for follow-up messages", () => {
    const steps = generateThinkingSteps("Und wie sieht es mit Haftung aus?", baseFilters, true);
    expect(steps.length).toBeLessThan(8);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("search-sources");
    expect(ids).toContain("prepare");
  });

  it("generates exam-specific steps for exam mode", () => {
    const examFilters = { ...baseFilters, mode: "exam" as const };
    const steps = generateThinkingSteps("Quiz zum Strafrecht", examFilters);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("assess");
    expect(ids).toContain("topic");
    expect(ids).toContain("generate");
    expect(ids).not.toContain("search-sources");
  });

  it("extracts legal terms as pills", () => {
    const steps = generateThinkingSteps("§ 1295 ABGB Haftung", baseFilters);
    const termsStep = steps.find((s) => s.id === "terms");
    expect(termsStep).toBeDefined();
    expect(termsStep?.pills?.length).toBeGreaterThan(0);
  });

  it("all steps start as pending", () => {
    const steps = generateThinkingSteps("test", baseFilters);
    for (const step of steps) {
      expect(step.status).toBe("pending");
    }
  });

  it("generates draft-specific steps for draft mode", () => {
    const draftFilters = { ...baseFilters, mode: "draft" as const };
    const steps = generateThinkingSteps("Erstelle mir einen Mietvertrag", draftFilters);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("assess");
    expect(ids).toContain("check-context");
    expect(ids).toContain("clarify");
    expect(ids).toContain("prepare");
    expect(ids).not.toContain("search-sources");
    expect(ids).not.toContain("subsumption");
  });

  it("auto-detects draft intent even in research mode", () => {
    const steps = generateThinkingSteps("Erstelle mir einen Kaufvertrag", baseFilters);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain("clarify");
    expect(ids).not.toContain("search-sources");
  });
});

describe("isDraftIntent", () => {
  it("detects draft creation patterns", () => {
    expect(isDraftIntent("Erstelle mir einen Mietvertrag")).toBe(true);
    expect(isDraftIntent("Schreib mir eine Kündigung")).toBe(true);
    expect(isDraftIntent("Ich brauche einen NDA")).toBe(true);
    expect(isDraftIntent("Entwirf eine Vollmacht")).toBe(true);
  });

  it("does not match pure research queries", () => {
    expect(isDraftIntent("Was regelt § 1295 ABGB?")).toBe(false);
    expect(isDraftIntent("Erkläre mir Verjährung")).toBe(false);
  });
});

describe("createThinkingController", () => {
  it("advances steps and notifies via callback", () => {
    const steps = generateThinkingSteps("test", baseFilters);
    let lastUpdate: typeof steps = [];
    const ctrl = createThinkingController(steps, (updated) => {
      lastUpdate = updated;
    });

    ctrl.advanceStep("assess", "active");
    const assessStep = lastUpdate.find((s) => s.id === "assess");
    expect(assessStep?.status).toBe("active");
  });

  it("marks all previous steps as done when advancing", () => {
    const steps = generateThinkingSteps("test query with norms", baseFilters);
    let lastUpdate: typeof steps = [];
    const ctrl = createThinkingController(steps, (updated) => {
      lastUpdate = updated;
    });

    // Advance to a later step
    ctrl.advanceStep("search-sources", "active");
    const assess = lastUpdate.find((s) => s.id === "assess");
    const jurisdiction = lastUpdate.find((s) => s.id === "jurisdiction");
    expect(assess?.status).toBe("done");
    expect(jurisdiction?.status).toBe("done");
  });

  it("completeAll marks everything as done", () => {
    const steps = generateThinkingSteps("test", baseFilters);
    let lastUpdate: typeof steps = [];
    const ctrl = createThinkingController(steps, (updated) => {
      lastUpdate = updated;
    });

    ctrl.completeAll();
    for (const step of lastUpdate) {
      expect(step.status).toBe("done");
    }
  });
});
