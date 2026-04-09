import { useEffect, useRef, useState } from "react";
import type {
  CreateSignalRequest,
  PortfolioResponse,
  ProjectDetail,
  ProjectStatus,
  WatcherStatus
} from "../shared/domain";
import { createSignal, getProject, getWatcherStatus, loadPortfolio, refreshJudgment, updateStatus } from "./api/client";
import { PortfolioList } from "./components/PortfolioList";
import { ProjectDetailPanel } from "./components/ProjectDetailPanel";

const STORAGE_KEY = "ai-native-project-backlog:last-root";
const DEFAULT_ROOT =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) ?? "" : "";

const deriveWatcherStatus = (portfolio: PortfolioResponse): WatcherStatus => {
  return (
    portfolio.watcherStatus ?? {
      rootPath: portfolio.rootPath,
      active: false,
      watchedProjectCount: portfolio.projects.length,
      mode: "idle"
    }
  );
};

export default function App() {
  const [rootPath, setRootPath] = useState(DEFAULT_ROOT);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatus>();
  const [selectedProjectId, setSelectedProjectId] = useState<string>();
  const [projectDetail, setProjectDetail] = useState<ProjectDetail>();
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [judgmentLoading, setJudgmentLoading] = useState(false);
  const [error, setError] = useState<string>();
  const lastWatcherRefreshAt = useRef<string>();

  // Auto-load the portfolio when a saved root path is found on first mount
  useEffect(() => {
    if (!DEFAULT_ROOT) return;
    setLoadingPortfolio(true);
    setError(undefined);
    void loadPortfolio(DEFAULT_ROOT)
      .then((nextPortfolio) => {
        applyPortfolio(nextPortfolio);
        setSelectedProjectId(nextPortfolio.projects[0]?.id);
      })
      .catch((caughtError: Error) => {
        setError(caughtError.message);
      })
      .finally(() => {
        setLoadingPortfolio(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — run once on mount only

  useEffect(() => {
    if (!selectedProjectId || !portfolio?.rootPath) {
      return;
    }

    setLoadingProject(true);
    void getProject(portfolio.rootPath, selectedProjectId)
      .then((detail) => {
        setProjectDetail(detail);
      })
      .catch((caughtError: Error) => {
        setError(caughtError.message);
      })
      .finally(() => {
        setLoadingProject(false);
      });
  }, [selectedProjectId, portfolio?.rootPath]);

  useEffect(() => {
    if (!portfolio?.rootPath || !portfolio.watcherStatus) {
      return;
    }

    const interval = window.setInterval(() => {
      void getWatcherStatus(portfolio.rootPath)
        .then(async (status) => {
          setWatcherStatus(status);

          if (!status.lastRefreshAt || status.lastRefreshAt === lastWatcherRefreshAt.current) {
            return;
          }

          lastWatcherRefreshAt.current = status.lastRefreshAt;
          const refreshedPortfolio = await loadPortfolio(portfolio.rootPath);
          applyPortfolio(refreshedPortfolio);

          if (selectedProjectId) {
            const refreshedProject = await getProject(portfolio.rootPath, selectedProjectId);
            setProjectDetail(refreshedProject);
          }
        })
        .catch(() => {
          setWatcherStatus((currentStatus) => currentStatus ?? deriveWatcherStatus(portfolio));
        });
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
  }, [portfolio?.rootPath, portfolio?.watcherStatus, selectedProjectId]);

  const applyPortfolio = (nextPortfolio: PortfolioResponse) => {
    setPortfolio(nextPortfolio);
    const nextWatcherStatus = deriveWatcherStatus(nextPortfolio);
    setWatcherStatus(nextWatcherStatus);
    if (nextWatcherStatus.lastRefreshAt) {
      lastWatcherRefreshAt.current = nextWatcherStatus.lastRefreshAt;
    }
  };

  const handleLoadPortfolio = async () => {
    setLoadingPortfolio(true);
    setError(undefined);

    try {
      const nextPortfolio = await loadPortfolio(rootPath);
      applyPortfolio(nextPortfolio);
      window.localStorage.setItem(STORAGE_KEY, rootPath);
      const firstProject = nextPortfolio.projects[0];
      setSelectedProjectId(firstProject?.id);
    } catch (caughtError) {
      setError((caughtError as Error).message);
    } finally {
      setLoadingPortfolio(false);
    }
  };

  const ensureSelection = (): string => {
    if (!selectedProjectId || !portfolio) {
      throw new Error("Select a project first.");
    }
    return selectedProjectId;
  };

  const handleRefreshJudgment = async () => {
    if (!portfolio) {
      return;
    }
    setJudgmentLoading(true);
    try {
      const detail = await refreshJudgment(portfolio.rootPath, ensureSelection());
      setProjectDetail(detail);
      applyPortfolio(await loadPortfolio(portfolio.rootPath));
    } catch (caughtError) {
      setError((caughtError as Error).message);
    } finally {
      setJudgmentLoading(false);
    }
  };

  const handleCreateSignal = async (payload: CreateSignalRequest) => {
    if (!portfolio) {
      return;
    }
    const detail = await createSignal(portfolio.rootPath, ensureSelection(), payload);
    setProjectDetail(detail);
    applyPortfolio(await loadPortfolio(portfolio.rootPath));
  };

  const handleUpdateStatus = async (status: ProjectStatus) => {
    if (!portfolio) {
      return;
    }
    const detail = await updateStatus(portfolio.rootPath, ensureSelection(), {
      status,
      actor: "human",
      rationale: `User set the project to ${status}.`
    });
    setProjectDetail(detail);
    applyPortfolio(await loadPortfolio(portfolio.rootPath));
  };

  const handleChooseFolder = async () => {
    const nextRoot = await window.desktopBridge?.selectPortfolioRoot();
    if (nextRoot) {
      setRootPath(nextRoot);
      setLoadingPortfolio(true);
      setError(undefined);
      try {
        const nextPortfolio = await loadPortfolio(nextRoot);
        applyPortfolio(nextPortfolio);
        window.localStorage.setItem(STORAGE_KEY, nextRoot);
        setSelectedProjectId(nextPortfolio.projects[0]?.id);
      } catch (caughtError) {
        setError((caughtError as Error).message);
      } finally {
        setLoadingPortfolio(false);
      }
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">AI-Native Backlog</p>
          <h1>The place where the AI keeps the project honest.</h1>
          <p className="hero-copy">
            Load a portfolio root, let the app bootstrap repo-local memory, and get an explainable next move instead
            of a pile of plausible nonsense.
          </p>
        </div>

        <div className="root-form">
          <label>
            Portfolio root
            <input
              value={rootPath}
              onChange={(event) => setRootPath(event.target.value)}
              placeholder="C:\Users\you\Documents\PersonalCode"
            />
          </label>
          {window.desktopBridge?.isDesktop ? (
            <button type="button" className="secondary-button" onClick={() => void handleChooseFolder()}>
              Choose Folder
            </button>
          ) : null}
          <button type="button" onClick={() => void handleLoadPortfolio()} disabled={loadingPortfolio || !rootPath}>
            {loadingPortfolio ? "Scanning..." : "Load Portfolio"}
          </button>
          <div className="watcher-strip">
            <strong>{watcherStatus?.active ? "Autopilot watching" : "Autopilot idle"}</strong>
            <span>
              {watcherStatus?.watchedProjectCount ?? 0} repos {watcherStatus?.active ? "under watch" : "loaded"}
            </span>
            {watcherStatus?.lastEventPath ? <span>Last change: {watcherStatus.lastEventPath}</span> : null}
            {watcherStatus?.mode === "error" && watcherStatus.errorMessage ? (
              <span className="watcher-error">{watcherStatus.errorMessage}</span>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="layout">
        <PortfolioList
          projects={portfolio?.projects ?? []}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
        />

        <ProjectDetailPanel
          detail={projectDetail}
          loading={loadingProject}
          error={undefined}
          judgmentLoading={judgmentLoading}
          onRefreshJudgment={handleRefreshJudgment}
          onCreateSignal={handleCreateSignal}
          onUpdateStatus={handleUpdateStatus}
        />
      </div>
    </main>
  );
}
