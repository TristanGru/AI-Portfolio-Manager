import fs from "node:fs";
import path from "node:path";
import { IGNORED_DIRECTORIES, PORTFOLIO_BRAIN_DIR, PROJECT_MEMORY_DIR } from "../../shared/constants.js";
import type { WatcherStatus } from "../../shared/domain.js";
import { findProject, loadPortfolio, readPortfolio } from "./portfolio-service.js";
import { refreshProjectMemory } from "./project-memory-service.js";

type WatchedRoot = {
  status: WatcherStatus;
  watcher?: fs.FSWatcher;
  refreshTimer?: NodeJS.Timeout;
};

const DEBOUNCE_MS = 900;
const watchedRoots = new Map<string, WatchedRoot>();

const idleStatus = (rootPath: string): WatcherStatus => ({
  rootPath,
  active: false,
  watchedProjectCount: 0,
  mode: "idle"
});

/**
 * Returns true if the path is a pending signal file that should be let through.
 * Format: <project>/.portfolio-brain/signals/pending/<filename> (not .tmp)
 */
const isPendingSignalPath = (relativePath: string): boolean => {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return (
    parts.length >= 4 &&
    parts[1] === PORTFOLIO_BRAIN_DIR &&
    parts[2] === "signals" &&
    parts[3] === "pending" &&
    !parts[parts.length - 1].endsWith(".tmp") &&
    !parts[parts.length - 1].startsWith(".")
  );
};

const shouldIgnoreRelativePath = (relativePath: string): boolean => {
  // Selectively allow pending signal paths through before applying the general filter
  if (isPendingSignalPath(relativePath)) {
    return false;
  }

  const parts = relativePath.split(/[\\/]+/).filter(Boolean);
  return parts.some(
    (part) => (part.startsWith(".") && part !== PROJECT_MEMORY_DIR) || IGNORED_DIRECTORIES.has(part)
  );
};

const projectPathFromRelative = (rootPath: string, relativePath?: string): string | undefined => {
  if (!relativePath) {
    return undefined;
  }

  const normalized = relativePath.split(/[\\/]+/).filter(Boolean);
  if (normalized.length === 0 || shouldIgnoreRelativePath(relativePath)) {
    return undefined;
  }

  return path.join(rootPath, normalized[0]);
};

const clearWatchedRootTimer = (watchedRoot: WatchedRoot): void => {
  if (watchedRoot.refreshTimer) {
    clearTimeout(watchedRoot.refreshTimer);
    watchedRoot.refreshTimer = undefined;
  }
};

const refreshWatchedRoot = async (rootPath: string, projectPath?: string): Promise<void> => {
  const watchedRoot = watchedRoots.get(rootPath);
  if (!watchedRoot) {
    return;
  }

  try {
    const portfolio = await loadPortfolio(rootPath);
    watchedRoot.status.active = true;
    watchedRoot.status.mode = "watching";
    watchedRoot.status.watchedProjectCount = portfolio.projects.length;
    watchedRoot.status.lastRefreshAt = new Date().toISOString();
    watchedRoot.status.errorMessage = undefined;

    if (!projectPath) {
      return;
    }

    const projectId = portfolio.projects.find((project) => project.path === projectPath)?.id;
    if (!projectId) {
      return;
    }

    const project = await findProject(rootPath, projectId);
    if (project) {
      await refreshProjectMemory(rootPath, project);
    }
  } catch (error) {
    watchedRoot.status.mode = "error";
    watchedRoot.status.errorMessage = (error as Error).message;
  }
};

const scheduleRefresh = (rootPath: string, eventPath?: string): void => {
  const watchedRoot = watchedRoots.get(rootPath);
  if (!watchedRoot) {
    return;
  }

  watchedRoot.status.lastEventAt = new Date().toISOString();
  watchedRoot.status.lastEventPath = eventPath;

  const projectPath = projectPathFromRelative(rootPath, eventPath);
  clearWatchedRootTimer(watchedRoot);
  watchedRoot.refreshTimer = setTimeout(() => {
    void refreshWatchedRoot(rootPath, projectPath);
  }, DEBOUNCE_MS);
};

export const startPortfolioWatch = async (rootPath: string): Promise<WatcherStatus> => {
  if (process.env.NODE_ENV === "test") {
    const portfolio = await readPortfolio(rootPath);
    return {
      rootPath,
      active: false,
      watchedProjectCount: portfolio.projects.length,
      mode: "idle"
    };
  }

  const existing = watchedRoots.get(rootPath);
  if (existing?.watcher) {
    const portfolio = await readPortfolio(rootPath);
    existing.status.watchedProjectCount = portfolio.projects.length;
    return existing.status;
  }

  const portfolio = await readPortfolio(rootPath);
  const status: WatcherStatus = {
    rootPath,
    active: true,
    watchedProjectCount: portfolio.projects.length,
    mode: "watching"
  };

  const watchedRoot: WatchedRoot = { status };
  watchedRoots.set(rootPath, watchedRoot);

  try {
    watchedRoot.watcher = fs.watch(rootPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) {
        scheduleRefresh(rootPath);
        return;
      }

      const relativePath = filename.toString();
      if (shouldIgnoreRelativePath(relativePath)) {
        return;
      }

      scheduleRefresh(rootPath, relativePath);
    });
    watchedRoot.watcher.unref?.();
  } catch (error) {
    watchedRoot.status.active = false;
    watchedRoot.status.mode = "error";
    watchedRoot.status.errorMessage = (error as Error).message;
  }

  return watchedRoot.status;
};

export const getWatcherStatus = async (rootPath: string): Promise<WatcherStatus> => {
  if (process.env.NODE_ENV === "test") {
    const portfolio = await readPortfolio(rootPath);
    return {
      rootPath,
      active: false,
      watchedProjectCount: portfolio.projects.length,
      mode: "idle"
    };
  }

  const existing = watchedRoots.get(rootPath);
  if (!existing) {
    return idleStatus(rootPath);
  }

  const portfolio = await readPortfolio(rootPath);
  existing.status.watchedProjectCount = portfolio.projects.length;
  return existing.status;
};
