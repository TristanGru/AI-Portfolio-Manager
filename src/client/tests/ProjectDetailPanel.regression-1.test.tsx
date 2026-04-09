import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../../shared/domain";
import { ProjectDetailPanel } from "../components/ProjectDetailPanel";

// Regression: ISSUE-001 - raw markdown leaked into project guidance panels
// Found by /qa on 2026-04-07
// Report: .gstack/qa-reports/qa-report-localhost-4173-2026-04-07.md

const mockedDetail: ProjectDetail = {
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
  thesisMarkdown: "# Project Thesis\n\n## Product\nProject Alpha\n\n## Drift warnings\n- Stay focused\n- Skip backlog theater",
  agentBriefMarkdown: "# Coding Agent Brief\n\n- Start from evidence\n- Do not widen scope",
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
  nextTaskMarkdown: "# Next Task\n\n- Read the latest recommendation\n- Preserve the thesis",
  updatedAt: new Date().toISOString()
};

describe("ProjectDetailPanel markdown rendering", () => {
  it("renders markdown as readable headings and lists instead of raw tokens", () => {
    render(
      <ProjectDetailPanel
        detail={mockedDetail}
        loading={false}
        judgmentLoading={false}
        onRefreshJudgment={vi.fn(async () => undefined)}
        onCreateSignal={vi.fn(async () => undefined)}
        onUpdateStatus={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByRole("heading", { name: "Project Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Product" })).toBeInTheDocument();
    expect(screen.getByText("Project Alpha", { selector: ".markdown-block p" })).toBeInTheDocument();
    expect(screen.getByText("Stay focused")).toBeInTheDocument();
    expect(screen.queryByText("# Project Thesis")).not.toBeInTheDocument();
    expect(screen.queryByText("- Preserve the thesis")).not.toBeInTheDocument();
  });
});
