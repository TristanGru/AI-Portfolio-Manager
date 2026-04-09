import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../lib/errors.js";

export const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const exists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const readJson = async <T>(filePath: string, fallback: T): Promise<T> => {
  if (!(await exists(filePath))) {
    return fallback;
  }

  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
};

export const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const writeMarkdown = async (filePath: string, content: string): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${content.trim()}\n`, "utf8");
};

export const readText = async (filePath: string, fallback = ""): Promise<string> => {
  if (!(await exists(filePath))) {
    return fallback;
  }

  return fs.readFile(filePath, "utf8");
};

export const readJsonl = async <T>(filePath: string): Promise<T[]> => {
  if (!(await exists(filePath))) {
    return [];
  }

  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
};

export const writeJsonl = async (filePath: string, items: unknown[]): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  const body = items.map((item) => JSON.stringify(item)).join("\n");
  await fs.writeFile(filePath, body ? `${body}\n` : "", "utf8");
};

export const appendJsonl = async (filePath: string, item: unknown): Promise<void> => {
  await ensureDir(path.dirname(filePath));
  await fs.appendFile(filePath, `${JSON.stringify(item)}\n`, "utf8");
};

export const readDirectory = async (targetPath: string): Promise<string[]> => {
  const entries = await fs.readdir(targetPath);
  return entries;
};

export const readDirectoryStats = async (targetPath: string): Promise<Dirent[]> =>
  fs.readdir(targetPath, { withFileTypes: true, encoding: "utf8" });

export const assertInside = (rootPath: string, targetPath: string): void => {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);

  if (!normalizedTarget.startsWith(normalizedRoot)) {
    throw new AppError(400, "VALIDATION_ERROR", "Resolved path escaped the root.");
  }
};
