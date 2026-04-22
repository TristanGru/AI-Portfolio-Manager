import path from "node:path";
import { PORTFOLIO_BRAIN_DIR } from "../../shared/constants.js";
import type { PortfolioResponse, ProjectSummary } from "../../shared/domain.js";
import { ensureDir, readDirectoryStats, readJson, writeJson, writeMarkdown } from "./fs-utils.js";
import { ensureProjectMemory, readProjectSnapshot } from "./project-memory-service.js";
import { createProjectId } from "./path-utils.js";

const portfolioPath = (rootPath: string, ...parts: string[]): string =>
  path.join(rootPath, PORTFOLIO_BRAIN_DIR, ...parts);

const isProjectDirectory = (name: string): boolean =>
  !name.startsWith(".") && name !== PORTFOLIO_BRAIN_DIR && name !== "node_modules";

const baseProjectSummary = (rootPath: string, projectPath: string): ProjectSummary => ({
  id: createProjectId(rootPath, projectPath),
  name: path.basename(projectPath),
  path: projectPath,
  status: "active",
  lastScannedAt: "",
  topRecommendationType: "investigate",
  momentumScore: 0,
  reasonSnippet: "No recommendation yet."
});

export const loadPortfolio = async (rootPath: string): Promise<PortfolioResponse> => {
  await ensureDir(portfolioPath(rootPath));

  const entries = await readDirectoryStats(rootPath);
  const projectPaths = entries
    .filter((entry) => entry.isDirectory() && isProjectDirectory(entry.name))
    .map((entry) => path.join(rootPath, entry.name));

  const projects = await Promise.all(
    projectPaths.map(async (projectPath) => {
      const project = baseProjectSummary(rootPath, projectPath);
      const snapshot = await readProjectSnapshot(rootPath, project);
      return snapshot.project;
    })
  );

  const generatedAt = new Date().toISOString();
  const sortedProjects = [...projects].sort((left, right) => right.momentumScore - left.momentumScore);
  const response: PortfolioResponse = {
    rootPath,
    generatedAt,
    projects: sortedProjects
  };

  await writeJson(portfolioPath(rootPath, "projects-index.json"), response);
  await writeMarkdown(
    portfolioPath(rootPath, "attention-queue.md"),
    [
      "# Portfolio Attention Queue",
      "",
      ...sortedProjects.map(
        (project, index) =>
          `${index + 1}. ${project.name} (${project.status}) -> ${project.topRecommendationType}: ${project.reasonSnippet}`
      )
    ].join("\n")
  );
  await writeMarkdown(
    portfolioPath(rootPath, "current-focus.md"),
    [
      "# Current Focus",
      "",
      sortedProjects[0] ? `Top project: ${sortedProjects[0].name}` : "No projects discovered yet.",
      "",
      ...sortedProjects.slice(0, 3).map((project, index) => {
        return `${index + 1}. ${project.name} -> ${project.topRecommendationType} (${project.status})`;
      })
    ].join("\n")
  );

  return response;
};

export const readPortfolio = async (rootPath: string): Promise<PortfolioResponse> =>
  readJson(portfolioPath(rootPath, "projects-index.json"), {
    rootPath,
    generatedAt: "",
    projects: []
  });

export const findProject = async (
  rootPath: string,
  projectId: string
): Promise<ProjectSummary | undefined> => {
  const portfolio = await readPortfolio(rootPath);
  return portfolio.projects.find((project) => project.id === projectId);
};
