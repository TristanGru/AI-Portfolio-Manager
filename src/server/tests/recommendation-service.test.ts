import { describe, expect, it } from "vitest";
import type { SignalRecord } from "../../shared/domain.js";
import { generateRecommendations } from "../services/recommendation-service.js";

describe("generateRecommendations", () => {
  it("prefers fix when feedback reports something broken", () => {
    const signals: SignalRecord[] = [
      {
        id: "sig_1",
        type: "feedback",
        source: "manual",
        summary: "Users hit a broken onboarding bug",
        details: "The first scan feels confusing and broken.",
        evidenceRefs: ["manual:test"],
        freshnessScore: 1,
        confidence: 1,
        createdAt: new Date().toISOString()
      }
    ];

    const [top] = generateRecommendations("demo", "active", signals);
    expect(top.actionType).toBe("fix");
    expect(top.evidenceRefs).toContain("manual:test");
  });

  it("never recommends build for archived projects", () => {
    const signals: SignalRecord[] = [
      {
        id: "sig_2",
        type: "idea",
        source: "manual",
        summary: "Add a flashy new feature",
        evidenceRefs: ["manual:idea"],
        freshnessScore: 1,
        confidence: 1,
        createdAt: new Date().toISOString()
      }
    ];

    const [top] = generateRecommendations("demo", "archived", signals);
    expect(top.actionType).not.toBe("build");
  });

  it("prefers investigate over build for an empty repo", () => {
    const signals: SignalRecord[] = [
      {
        id: "sig_3",
        type: "repo-state",
        source: "repo-scan",
        summary: "The repository has no source files yet.",
        evidenceRefs: ["repo:empty"],
        freshnessScore: 1,
        confidence: 1,
        createdAt: new Date().toISOString()
      }
    ];

    const [top] = generateRecommendations("demo", "active", signals);
    expect(top.actionType).toBe("investigate");
  });
});
