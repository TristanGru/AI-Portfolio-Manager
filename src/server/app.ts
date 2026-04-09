import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LoadPortfolioRequestSchema, CreateSignalRequestSchema, UpdateStatusRequestSchema } from "../shared/domain.js";
import { asAppError, AppError } from "./lib/errors.js";
import { logError, logInfo } from "./lib/logger.js";
import { findProject, loadPortfolio, readPortfolio } from "./services/portfolio-service.js";
import { appendManualSignal, readProjectSnapshot, runProjectJudgment, updateProjectStatus } from "./services/project-memory-service.js";
import { ensureAbsoluteDirectory } from "./services/path-utils.js";
import { getWatcherStatus, startPortfolioWatch } from "./services/watcher-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveClientDist = (): string | undefined => {
  const candidates = [
    path.resolve(__dirname, "../../../dist/client"),
    path.resolve(__dirname, "../../dist/client"),
    path.resolve(__dirname, "../client"),
    path.resolve(process.cwd(), "dist/client")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
};

export const createApp = () => {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logInfo("request.complete", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  });

  app.post("/api/portfolio/load", async (req, res, next) => {
    try {
      const payload = LoadPortfolioRequestSchema.parse(req.body);
      const rootPath = await ensureAbsoluteDirectory(payload.rootPath);
      const portfolio = await loadPortfolio(rootPath);
      const watcherStatus = await startPortfolioWatch(rootPath);
      res.json({ ...portfolio, watcherStatus });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/portfolio", async (req, res, next) => {
    try {
      const rootPath = await ensureAbsoluteDirectory(String(req.query.rootPath ?? ""));
      const portfolio = await readPortfolio(rootPath);
      const watcherStatus = await getWatcherStatus(rootPath);
      res.json({ ...portfolio, watcherStatus });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/watcher", async (req, res, next) => {
    try {
      const rootPath = await ensureAbsoluteDirectory(String(req.query.rootPath ?? ""));
      const watcherStatus = await getWatcherStatus(rootPath);
      res.json(watcherStatus);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectId", async (req, res, next) => {
    try {
      const rootPath = await ensureAbsoluteDirectory(String(req.query.rootPath ?? ""));
      const project = await findProject(rootPath, req.params.projectId);

      if (!project) {
        throw new AppError(404, "PATH_NOT_FOUND", "Project not found.");
      }

      const snapshot = await readProjectSnapshot(rootPath, project);
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/signals", async (req, res, next) => {
    try {
      const rootPath = await ensureAbsoluteDirectory(String(req.query.rootPath ?? ""));
      const payload = CreateSignalRequestSchema.parse(req.body);
      const project = await findProject(rootPath, req.params.projectId);

      if (!project) {
        throw new AppError(404, "PATH_NOT_FOUND", "Project not found.");
      }

      const snapshot = await appendManualSignal(rootPath, project, payload);
      await loadPortfolio(rootPath);
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/refresh", async (req, res, next) => {
    try {
      const rootPath = await ensureAbsoluteDirectory(String(req.query.rootPath ?? ""));
      const project = await findProject(rootPath, req.params.projectId);

      if (!project) {
        throw new AppError(404, "PATH_NOT_FOUND", "Project not found.");
      }

      const snapshot = await readProjectSnapshot(rootPath, project);
      await loadPortfolio(rootPath);
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/judgment", async (req, res, next) => {
    try {
      const rootPath = await ensureAbsoluteDirectory(String(req.query.rootPath ?? ""));
      const project = await findProject(rootPath, req.params.projectId);

      if (!project) {
        throw new AppError(404, "PATH_NOT_FOUND", "Project not found.");
      }

      const snapshot = await runProjectJudgment(rootPath, project);
      await loadPortfolio(rootPath);
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectId/status", async (req, res, next) => {
    try {
      const rootPath = await ensureAbsoluteDirectory(String(req.query.rootPath ?? ""));
      const payload = UpdateStatusRequestSchema.parse(req.body);
      const project = await findProject(rootPath, req.params.projectId);

      if (!project) {
        throw new AppError(404, "PATH_NOT_FOUND", "Project not found.");
      }

      const snapshot = await updateProjectStatus(rootPath, project, payload);
      await loadPortfolio(rootPath);
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  if (process.env.NODE_ENV === "production") {
    const clientDist = resolveClientDist();

    if (clientDist) {
      app.use(express.static(clientDist));
      app.get("*", (_req, res, next) => {
        if (_req.path.startsWith("/api")) {
          next();
          return;
        }

        res.sendFile(path.join(clientDist, "index.html"));
      });
    }
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const appError = asAppError(error);
    logError("request.failed", { code: appError.code, message: appError.message });
    res.status(appError.statusCode).json({
      error: {
        code: appError.code,
        message: appError.message
      }
    });
  });

  return app;
};
