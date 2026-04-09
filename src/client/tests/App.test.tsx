import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioResponse, ProjectDetail } from "../../shared/domain";
import App from "../App";

vi.mock("../api/client", () => ({
  loadPortfolio: vi.fn(),
  getProject: vi.fn(),
  refreshJudgment: vi.fn(),
  createSignal: vi.fn(),
  updateStatus: vi.fn(),
  getWatcherStatus: vi.fn()
}));

import { createSignal, getProject, getWatcherStatus, loadPortfolio, refreshJudgment, updateStatus } from "../api/client";

const mockedPortfolio: PortfolioResponse = {
  rootPath: "C:/Portfolio",
  generatedAt: new Date().toISOString(),
  watcherStatus: {
    rootPath: "C:/Portfolio",
    active: true,
    watchedProjectCount: 1,
    mode: "watching"
  },
  projects: [
    {
      id: "project-alpha",
      name: "Project Alpha",
      path: "C:/Portfolio/project-alpha",
      status: "active",
      lastScannedAt: new Date().toISOString(),
      topRecommendationType: "build",
      momentumScore: 82,
      reasonSnippet: "Fresh signals point to a build move."
    }
  ]
};

const mockedDetail: ProjectDetail = {
  rootPath: "C:/Portfolio",
  project: mockedPortfolio.projects[0],
  thesisMarkdown: "# Thesis",
  agentBriefMarkdown: "# Coding Agent Brief",
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
      createdAt: new Date().toISOString(),
      hasLlmRationale: true
    }
  ],
  decisionHistory: [],
  nextTaskMarkdown: "# Next Task",
  updatedAt: new Date().toISOString()
};

describe("App", () => {
  beforeEach(() => {
    vi.mocked(loadPortfolio).mockResolvedValue(mockedPortfolio);
    vi.mocked(getProject).mockResolvedValue(mockedDetail);
    vi.mocked(refreshJudgment).mockResolvedValue(mockedDetail);
    vi.mocked(createSignal).mockResolvedValue(mockedDetail);
    vi.mocked(updateStatus).mockResolvedValue(mockedDetail);
    vi.mocked(getWatcherStatus).mockResolvedValue(mockedPortfolio.watcherStatus!);
  });

  it("loads portfolio data and shows the project recommendation", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText(/portfolio root/i), {
      target: { value: "C:/Portfolio" }
    });
    fireEvent.click(screen.getByRole("button", { name: /load portfolio/i }));

    await waitFor(() => {
      expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/fresh idea signals say this project has momentum/i)).toBeInTheDocument();
    });
  });
});
