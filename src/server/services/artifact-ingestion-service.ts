import fs from "node:fs/promises";
import path from "node:path";
import { IGNORED_DIRECTORIES, MAX_LIST_ITEMS, PROJECT_MEMORY_DIR } from "../../shared/constants.js";
import type { SignalRecord } from "../../shared/domain.js";
import { createId } from "../lib/ids.js";

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json"]);
const MAX_FILES = 12;
const MAX_LINES_PER_FILE = 4;
const MAX_READ_BYTES = 32_000;

const isIgnored = (entryName: string): boolean =>
  entryName.startsWith(".") && entryName !== PROJECT_MEMORY_DIR ? true : IGNORED_DIRECTORIES.has(entryName);

const classifyArtifactType = (relativePath: string): "feedback" | "note" | "idea" | undefined => {
  const name = path.basename(relativePath).toLowerCase();

  if (/(bug|bugs|issue|issues|todo|todos|feedback|support)/.test(name)) {
    return "feedback";
  }

  if (/(idea|ideas|wishlist|roadmap|backlog)/.test(name)) {
    return "idea";
  }

  if (/(note|notes|chat|chats|claude|codex|conversation|journal|log)/.test(name)) {
    return "note";
  }

  return undefined;
};

const collectCandidateFiles = async (
  rootPath: string,
  currentPath: string,
  files: string[]
): Promise<void> => {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (isIgnored(entry.name) || files.length >= MAX_FILES) {
      continue;
    }

    const nextPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      await collectCandidateFiles(rootPath, nextPath, files);
      continue;
    }

    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    const relativePath = path.relative(rootPath, nextPath);

    if (!classifyArtifactType(relativePath)) {
      continue;
    }

    files.push(relativePath);
  }
};

const normalizeLine = (line: string): string =>
  line
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^- \[[x ]\]\s+/i, "")
    .replace(/^#+\s+/, "")
    .trim();

const extractSignalLines = (raw: string): { summary: string; lineNumber: number }[] => {
  const lines = raw.split(/\r?\n/).slice(0, 200);
  const explicitBullets = lines
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => /^(\s*[-*]\s+|\s*\d+\.\s+|\s*-\s\[[x ]\]\s+)/i.test(line))
    .map(({ line, lineNumber }) => ({ summary: normalizeLine(line), lineNumber }))
    .filter(({ summary }) => summary.length >= 8);

  if (explicitBullets.length > 0) {
    return explicitBullets.slice(0, MAX_LINES_PER_FILE);
  }

  return lines
    .map((line, index) => ({ summary: normalizeLine(line), lineNumber: index + 1 }))
    .filter(({ summary }) => summary.length >= 16)
    .slice(0, MAX_LINES_PER_FILE);
};

const freshnessFromMtime = (mtimeMs: number): number => {
  const ageInDays = Math.max(0, (Date.now() - mtimeMs) / (1000 * 60 * 60 * 24));
  return Number(Math.max(0.35, 1 - ageInDays * 0.08).toFixed(2));
};

const isWorkspaceFile = (relativePath: string): boolean =>
  relativePath.includes(`${PROJECT_MEMORY_DIR}/workspace/`);

export const ingestArtifactSignals = async (
  projectId: string,
  projectPath: string
): Promise<SignalRecord[]> => {
  const candidateFiles: string[] = [];
  await collectCandidateFiles(projectPath, projectPath, candidateFiles);

  // Workspace files get priority slots — sort them first
  const sorted = [
    ...candidateFiles.filter(isWorkspaceFile),
    ...candidateFiles.filter((f) => !isWorkspaceFile(f))
  ];

  const signals: SignalRecord[] = [];

  for (const relativePath of sorted.slice(0, MAX_FILES)) {
    const type = classifyArtifactType(relativePath);
    if (!type) {
      continue;
    }

    const absolutePath = path.join(projectPath, relativePath);
    const [raw, stats] = await Promise.all([
      fs.readFile(absolutePath, "utf8").then((content) => content.slice(0, MAX_READ_BYTES)),
      fs.stat(absolutePath)
    ]);

    const items = extractSignalLines(raw);
    const workspace = isWorkspaceFile(relativePath);

    for (const item of items) {
      signals.push({
        id: createId("sig_auto"),
        type,
        source: workspace ? `workspace:${path.basename(relativePath)}` : `artifact-scan:${relativePath}`,
        summary: item.summary,
        details: workspace ? `Written by coding agent in ${relativePath}` : `Auto-ingested from ${relativePath}`,
        evidenceRefs: [`artifact:${relativePath}#L${item.lineNumber}`, `repo:${relativePath}`, `project:${projectId}`],
        freshnessScore: workspace ? Math.min(1, freshnessFromMtime(stats.mtimeMs) + 0.15) : freshnessFromMtime(stats.mtimeMs),
        confidence: workspace ? 0.88 : 0.74,
        createdAt: new Date(stats.mtimeMs).toISOString()
      });
    }
  }

  return signals
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_LIST_ITEMS);
};
