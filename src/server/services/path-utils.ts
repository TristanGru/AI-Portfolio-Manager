import path from "node:path";
import { AppError } from "../lib/errors.js";

const SLUG_REPLACER = /[^a-z0-9]+/g;

export const ensureAbsoluteDirectory = async (inputPath: string): Promise<string> => {
  if (!path.isAbsolute(inputPath)) {
    throw new AppError(400, "VALIDATION_ERROR", "Path must be absolute.");
  }

  const normalized = path.resolve(inputPath);
  const fs = await import("node:fs/promises");
  const stats = await fs.stat(normalized).catch(() => null);

  if (!stats || !stats.isDirectory()) {
    throw new AppError(404, "PATH_NOT_FOUND", `Directory not found: ${normalized}`);
  }

  return normalized;
};

export const createProjectId = (rootPath: string, projectPath: string): string => {
  const relative = path.relative(rootPath, projectPath) || path.basename(projectPath);
  return relative.toLowerCase().replace(SLUG_REPLACER, "-").replace(/^-+|-+$/g, "") || "project";
};

export const joinSafe = (basePath: string, ...parts: string[]): string => {
  const joined = path.resolve(basePath, ...parts);

  if (!joined.startsWith(path.resolve(basePath))) {
    throw new AppError(400, "VALIDATION_ERROR", "Unsafe path traversal attempt.");
  }

  return joined;
};
