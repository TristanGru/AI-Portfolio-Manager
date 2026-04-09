import fs from "node:fs/promises";
import path from "node:path";
import { PORTFOLIO_BRAIN_DIR } from "../../shared/constants.js";
import type { SignalRecord } from "../../shared/domain.js";
import { createId } from "../lib/ids.js";
import { ensureDir } from "./fs-utils.js";

const MAX_PENDING_FILES = 50;
const PENDING_SUBDIR = path.join("signals", "pending");
const PROCESSED_SUBDIR = path.join("signals", "processed");
const ERRORS_SUBDIR = path.join("signals", "errors");

const VALID_TYPES = new Set(["feedback", "note", "idea"]);

type ParsedFields = {
  type: "feedback" | "note" | "idea";
  summary: string;
  source: string;
  details?: string;
};

type ParseError = { error: string };

const validateFields = (fields: Record<string, unknown>): ParsedFields | ParseError => {
  if (!fields.type || !VALID_TYPES.has(fields.type as string)) {
    return { error: `Invalid or missing 'type'. Must be feedback, note, or idea. Got: ${String(fields.type)}` };
  }
  if (!fields.summary || typeof fields.summary !== "string" || fields.summary.trim().length < 3) {
    return { error: "Missing or too-short 'summary' field (min 3 chars)." };
  }
  return {
    type: fields.type as "feedback" | "note" | "idea",
    summary: fields.summary.trim(),
    source: typeof fields.source === "string" ? fields.source : "claude-code",
    details: typeof fields.details === "string" ? fields.details.trim() || undefined : undefined
  };
};

const parseMdFile = async (filePath: string): Promise<ParsedFields | ParseError> => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const { default: matter } = await import("gray-matter");
    const parsed = matter(content);
    const fields: Record<string, unknown> = { ...parsed.data };
    if (!fields.details && parsed.content.trim()) {
      fields.details = parsed.content.trim();
    }
    return validateFields(fields);
  } catch (e) {
    return { error: `Failed to parse .md file: ${(e as Error).message}` };
  }
};

const parseJsonlFile = async (filePath: string): Promise<ParsedFields | ParseError> => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const firstLine = content.split("\n").find((line) => line.trim());
    if (!firstLine) return { error: "Empty .jsonl file." };
    const parsed = JSON.parse(firstLine) as Record<string, unknown>;
    return validateFields(parsed);
  } catch (e) {
    return { error: `Failed to parse .jsonl file: ${(e as Error).message}` };
  }
};

export const ingestPendingSignals = async (
  projectId: string,
  projectPath: string
): Promise<SignalRecord[]> => {
  const brainPath = path.join(projectPath, PORTFOLIO_BRAIN_DIR);
  const pendingDir = path.join(brainPath, PENDING_SUBDIR);
  const processedDir = path.join(brainPath, PROCESSED_SUBDIR);
  const errorsDir = path.join(brainPath, ERRORS_SUBDIR);

  await Promise.all([ensureDir(pendingDir), ensureDir(processedDir), ensureDir(errorsDir)]);

  let entries;
  try {
    entries = await fs.readdir(pendingDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const candidates = entries
    .filter((e) => e.isFile() && !e.name.endsWith(".tmp") && !e.name.startsWith("."))
    .slice(0, MAX_PENDING_FILES);

  const signals: SignalRecord[] = [];

  for (const entry of candidates) {
    const srcPath = path.join(pendingDir, entry.name);
    const ext = path.extname(entry.name).toLowerCase();

    let result: ParsedFields | ParseError;
    if (ext === ".md") {
      result = await parseMdFile(srcPath);
    } else if (ext === ".jsonl" || ext === ".json") {
      result = await parseJsonlFile(srcPath);
    } else {
      result = { error: `Unsupported file type: ${ext}. Use .md or .jsonl` };
    }

    if ("error" in result) {
      try {
        await fs.rename(srcPath, path.join(errorsDir, entry.name));
        await fs.writeFile(path.join(errorsDir, `${entry.name}.error.txt`), `${result.error}\n`, "utf8");
      } catch {
        // Leave the file in place if rename fails
      }
      continue;
    }

    const signal: SignalRecord = {
      id: createId("sig_pending"),
      type: result.type,
      source: result.source,
      summary: result.summary,
      details: result.details,
      evidenceRefs: [`pending:${entry.name}`, `project:${projectId}`],
      freshnessScore: 0.95,
      confidence: 0.88,
      createdAt: new Date().toISOString()
    };

    signals.push(signal);

    try {
      await fs.rename(srcPath, path.join(processedDir, entry.name));
    } catch {
      // Signal still captured even if rename fails
    }
  }

  return signals;
};
