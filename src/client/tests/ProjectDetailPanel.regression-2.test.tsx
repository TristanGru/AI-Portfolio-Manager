import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../../shared/domain";
import { ProjectDetailPanel } from "../components/ProjectDetailPanel";

// Regression: ISSUE-002 - missing coding-agent brief crashed the project detail view
// Found by /qa on 2026-04-07
// Report: .gstack/qa-reports/qa-report-localhost-4173-2026-04-07.md

const legacyDetail = {
  rootPath: "C:/Portfolio",
  project: {
    id: "project-alpha",
    name: "Project Alpha",
    path: "C:/Portfolio/project-alpha",
    status: "active",
    lastScannedAt: new Date().toISOString(),
    topRecommendationType: "build",
    momentumScore: 82,
    reasonSnippet: "Fresh signals point to a build move."
  },
  thesisMarkdown: "# Project Thesis\n\n## Product\nProject Alpha",
  signals: [],
  recommendations: [
    {
      id: "rec_1",
      projectId: "project-alpha",
      actionType: "build",
      title: "Build next",
      rationale: "Fresh idea signals say this project has momentum.",
      evidenceRefs: ["manual:idea:test"],
      confidence: 0.88,
      whatWouldChangeMind: "A cluster of bugs.",
      priorityScore: 0.91,
      createdAt: new Date().toISOString()
    }
  ],
  decisionHistory: [],
  nextTaskMarkdown: "# Next Task\n\n- Read the latest recommendation",
  updatedAt: new Date().toISOString()
} as unknown as ProjectDetail;

describe("ProjectDetailPanel legacy payload safety", () => {
  it("renders without crashing when coding-agent brief is missing", () => {
    render(
      <ProjectDetailPanel
        detail={legacyDetail}
        loading={false}
        judgmentLoading={false}
        onRefreshJudgment={vi.fn(async () => undefined)}
        onCreateSignal={vi.fn(async () => undefined)}
        onUpdateStatus={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByText("Coding Agent Brief")).toBeInTheDocument();
    expect(screen.getByText("Project Alpha", { selector: ".markdown-block p" })).toBeInTheDocument();
  });
});
