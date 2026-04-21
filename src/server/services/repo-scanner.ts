import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { IGNORED_DIRECTORIES, PROJECT_MEMORY_DIR } from "../../shared/constants.js";
import type { SignalRecord } from "../../shared/domain.js";
import { createId } from "../lib/ids.js";

const execFileAsync = promisify(execFile);

export type RepoHeuristics = {
  gitVelocity: number;
  humanVelocity: number;
  aiVelocity: number;
  gitLastCommitAgeDays: number;
  todoDensity: number;
  readmeCompleteness: number;
  testsPresent: boolean;
  depsPresent: boolean;
  heuristicSummary: string;
  isShallowClone: boolean;
  isGitRepo: boolean;
  activityLastDays: number;
  activitySessionsRecent: number;
};

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".html"]);

const isIgnored = (entryName: string): boolean =>
  entryName.startsWith(".") && entryName !== PROJECT_MEMORY_DIR ? true : IGNORED_DIRECTORIES.has(entryName);

const walk = async (rootPath: string, currentPath: string, files: string[]): Promise<void> => {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (isIgnored(entry.name)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    const nextPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      await walk(rootPath, nextPath, files);
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (CODE_EXTENSIONS.has(extension)) {
      files.push(path.relative(rootPath, nextPath));
    }
  }
};

const runGit = async (projectPath: string, args: string[]): Promise<string> => {
  const result = await execFileAsync("git", args, { cwd: projectPath, timeout: 10_000 });
  return result.stdout.trim();
};

const checkIsGitRepo = async (projectPath: string): Promise<boolean> => {
  try {
    await runGit(projectPath, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
};

const checkIsShallowClone = async (projectPath: string): Promise<boolean> => {
  try {
    const output = await runGit(projectPath, ["rev-parse", "--is-shallow-repository"]);
    return output === "true";
  } catch {
    return false;
  }
};

// Patterns that identify AI-agent authors (Claude, Copilot, GitHub Actions bots, etc.)
const AI_AUTHOR_PATTERNS = [/claude/i, /anthropic/i, /copilot/i, /github-actions/i, /\[bot\]/i, /bot@/i];

const isAiAuthor = (name: string, email: string): boolean =>
  AI_AUTHOR_PATTERNS.some((pattern) => pattern.test(name) || pattern.test(email));

const classifyCommits = async (
  projectPath: string,
  since: string
): Promise<{ humanCount: number; aiCount: number }> => {
  try {
    // %ae = author email, %an = author name; one line per commit scoped to this directory
    const output = await runGit(projectPath, ["log", `--since=${since}`, "--format=%ae\t%an", "--", "."]);
    if (!output) return { humanCount: 0, aiCount: 0 };

    let humanCount = 0;
    let aiCount = 0;
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      const tabIdx = line.indexOf("\t");
      const email = tabIdx >= 0 ? line.slice(0, tabIdx) : "";
      const name = tabIdx >= 0 ? line.slice(tabIdx + 1) : line;
      if (isAiAuthor(name, email)) {
        aiCount++;
      } else {
        humanCount++;
      }
    }
    return { humanCount, aiCount };
  } catch {
    return { humanCount: 0, aiCount: 0 };
  }
};

const getGitLastCommitAgeMs = async (projectPath: string): Promise<number | null> => {
  try {
    // %ct = committer timestamp (unix epoch); scope to this directory with "-- ."
    const output = await runGit(projectPath, ["log", "-1", "--format=%ct", "--", "."]);
    if (!output) return null;
    const timestamp = parseInt(output, 10);
    return isNaN(timestamp) ? null : Date.now() - timestamp * 1000;
  } catch {
    return null;
  }
};


const countTodos = async (files: string[], projectPath: string): Promise<number> => {
  let count = 0;
  for (const relativePath of files) {
    try {
      const content = await fs.readFile(path.join(projectPath, relativePath), "utf8");
      const matches = content.match(/\b(TODO|FIXME)\b/g);
      count += matches?.length ?? 0;
    } catch {
      // skip unreadable files
    }
  }
  return count;
};

const checkReadmeCompleteness = async (projectPath: string): Promise<number> => {
  try {
    const entries = await fs.readdir(projectPath);
    const readmeFile = entries.find((e) => /^readme/i.test(e));
    if (!readmeFile) return 0;
    const content = await fs.readFile(path.join(projectPath, readmeFile), "utf8");
    let score = 0;
    if (content.length > 50) score++;
    if (/##?\s*(install|getting.?started|setup)/i.test(content)) score++;
    if (/##?\s*(usage|how.?to.?use)/i.test(content)) score++;
    if (/##?\s*(demo|screenshot|preview|example)|!\[/i.test(content)) score++;
    return score;
  } catch {
    return 0;
  }
};

const checkTestsPresent = async (projectPath: string): Promise<boolean> => {
  const testDirs = ["test", "tests", "__tests__", "spec"];
  const thirtyDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 30;
  for (const dir of testDirs) {
    try {
      const stat = await fs.stat(path.join(projectPath, dir));
      if (stat.isDirectory() && stat.mtimeMs > thirtyDaysAgo) {
        return true;
      }
    } catch {
      // not found
    }
  }
  return false;
};

const checkDepsPresent = async (projectPath: string): Promise<boolean> => {
  const depsFiles = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "requirements.txt"];
  for (const file of depsFiles) {
    try {
      await fs.access(path.join(projectPath, file));
      return true;
    } catch {
      // not found
    }
  }
  return false;
};

const readActivityLog = async (projectPath: string): Promise<{ lastDays: number; recentCount: number }> => {
  const activityFile = path.join(projectPath, PROJECT_MEMORY_DIR, "activity.jsonl");
  try {
    const raw = await fs.readFile(activityFile, "utf8");
    const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
    let recentCount = 0;
    let mostRecentMs = 0;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { timestamp?: string };
        if (!entry.timestamp) continue;
        const ts = new Date(entry.timestamp).getTime();
        if (ts > cutoff) recentCount++;
        if (ts > mostRecentMs) mostRecentMs = ts;
      } catch {
        // skip malformed lines
      }
    }
    const lastDays = mostRecentMs > 0 ? Math.floor((Date.now() - mostRecentMs) / (24 * 3600 * 1000)) : 999;
    return { lastDays, recentCount };
  } catch {
    return { lastDays: 999, recentCount: 0 };
  }
};

const buildHeuristicSummary = (
  h: Omit<RepoHeuristics, "heuristicSummary">
): string => {
  const parts: string[] = [];

  if (!h.isGitRepo) {
    parts.push("no git");
  } else if (h.isShallowClone) {
    parts.push("shallow clone");
  } else {
    const agePart =
      h.gitLastCommitAgeDays >= 999
        ? "age unknown"
        : h.gitLastCommitAgeDays === 0
          ? "active today"
          : h.gitLastCommitAgeDays === 1
            ? "1d ago"
            : `${h.gitLastCommitAgeDays}d ago`;
    parts.push(agePart);
    // Show human/AI breakdown when both are present; fall back to total when only one type
    if (h.humanVelocity > 0 && h.aiVelocity > 0) {
      parts.push(`${h.humanVelocity}h+${h.aiVelocity}ai/wk`);
    } else {
      parts.push(`${h.gitVelocity}/wk`);
    }
  }

  if (h.activitySessionsRecent > 0) {
    const actLabel = h.activityLastDays === 0 ? "session today" : `session ${h.activityLastDays}d ago`;
    parts.push(`${h.activitySessionsRecent} logged (${actLabel})`);
  }

  if (h.todoDensity > 0) parts.push(`${h.todoDensity} TODOs`);
  parts.push(`README ${h.readmeCompleteness}/4`);
  if (h.testsPresent) parts.push("tests");

  return parts.join(" · ");
};

export const buildRepoHeuristics = async (projectPath: string): Promise<RepoHeuristics> => {
  const gitRepo = await checkIsGitRepo(projectPath);

  const files: string[] = [];
  try {
    await walk(projectPath, projectPath, files);
  } catch {
    // ignore walk errors
  }

  const [todoDensity, readmeCompleteness, testsPresent, depsPresent, activityLog] = await Promise.all([
    countTodos(files, projectPath),
    checkReadmeCompleteness(projectPath),
    checkTestsPresent(projectPath),
    checkDepsPresent(projectPath),
    readActivityLog(projectPath)
  ]);

  let gitVelocity = 0;
  let humanVelocity = 0;
  let aiVelocity = 0;
  let gitLastCommitAgeDays = 0;
  let isShallowClone = false;

  if (gitRepo) {
    isShallowClone = await checkIsShallowClone(projectPath);

    if (!isShallowClone) {
      const [{ humanCount, aiCount }, lastCommitAgeMs] = await Promise.all([
        classifyCommits(projectPath, "14 days ago"),
        getGitLastCommitAgeMs(projectPath)
      ]);

      humanVelocity = Math.round(humanCount / 2);
      aiVelocity = Math.round(aiCount / 2);
      gitVelocity = humanVelocity + aiVelocity;
      // Use a large sentinel (999) when we can't determine age, so it doesn't show as "active today"
      gitLastCommitAgeDays =
        lastCommitAgeMs != null ? Math.floor(lastCommitAgeMs / (1000 * 60 * 60 * 24)) : 999;
    }
  }

  const partial = {
    gitVelocity,
    humanVelocity,
    aiVelocity,
    gitLastCommitAgeDays,
    todoDensity,
    readmeCompleteness,
    testsPresent,
    depsPresent,
    isShallowClone,
    isGitRepo: gitRepo,
    activityLastDays: activityLog.lastDays,
    activitySessionsRecent: activityLog.recentCount
  };

  return { ...partial, heuristicSummary: buildHeuristicSummary(partial) };
};

export const buildRepoSignals = async (projectId: string, projectPath: string): Promise<SignalRecord[]> => {
  const heuristics = await buildRepoHeuristics(projectPath);
  const createdAt = new Date().toISOString();
  const signals: SignalRecord[] = [];

  signals.push({
    id: createId("sig_repo"),
    type: "repo-state",
    source: "repo-scan",
    summary: heuristics.heuristicSummary || "Repo scanned.",
    details: JSON.stringify({
      gitVelocity: heuristics.gitVelocity,
      humanVelocity: heuristics.humanVelocity,
      aiVelocity: heuristics.aiVelocity,
      gitLastCommitAgeDays: heuristics.gitLastCommitAgeDays,
      todoDensity: heuristics.todoDensity,
      readmeCompleteness: heuristics.readmeCompleteness,
      testsPresent: heuristics.testsPresent,
      depsPresent: heuristics.depsPresent
    }),
    evidenceRefs: [`repo:${projectId}`],
    freshnessScore: 0.9,
    confidence: 0.85,
    createdAt
  });

  if (!heuristics.isGitRepo) {
    signals.push({
      id: createId("sig_repo"),
      type: "repo-state",
      source: "repo-scan",
      summary: "No git history. Activity signals unavailable.",
      evidenceRefs: [`repo:${projectId}:no-git`],
      freshnessScore: 0.7,
      confidence: 0.9,
      createdAt
    });
  }

  if (heuristics.todoDensity > 10) {
    signals.push({
      id: createId("sig_repo"),
      type: "repo-state",
      source: "repo-scan",
      summary: `High TODO density: ${heuristics.todoDensity} TODOs/FIXMEs. Consider a fix or investigate pass.`,
      evidenceRefs: [`repo:${projectId}:todos`],
      freshnessScore: 0.8,
      confidence: 0.85,
      createdAt
    });
  }

  if (heuristics.readmeCompleteness < 2) {
    signals.push({
      id: createId("sig_repo"),
      type: "repo-state",
      source: "repo-scan",
      summary: `README incomplete (${heuristics.readmeCompleteness}/4). Missing install, usage, or demo sections.`,
      evidenceRefs: [`repo:${projectId}:readme`],
      freshnessScore: 0.7,
      confidence: 0.8,
      createdAt
    });
  }

  if (heuristics.activitySessionsRecent > 0 && heuristics.activityLastDays < 7) {
    signals.push({
      id: createId("sig_repo"),
      type: "repo-state",
      source: "repo-scan",
      summary: `Active work sessions logged: ${heuristics.activitySessionsRecent} session${heuristics.activitySessionsRecent > 1 ? "s" : ""} in the last 14 days. Last session ${heuristics.activityLastDays === 0 ? "today" : `${heuristics.activityLastDays}d ago`}.`,
      evidenceRefs: [`repo:${projectId}:activity-log`],
      freshnessScore: 0.95,
      confidence: 0.9,
      createdAt
    });
  }

  const recentlyActive = heuristics.activityLastDays < 14;
  if (heuristics.gitVelocity === 0 && heuristics.gitLastCommitAgeDays > 28 && heuristics.isGitRepo && !heuristics.isShallowClone && !recentlyActive) {
    signals.push({
      id: createId("sig_repo"),
      type: "repo-state",
      source: "repo-scan",
      summary: "No commits in 28 days and no logged work sessions. Project is dormant.",
      evidenceRefs: [`repo:${projectId}:dormant`],
      freshnessScore: 0.85,
      confidence: 0.9,
      createdAt
    });
  }

  if (heuristics.aiVelocity > 0 && heuristics.humanVelocity === 0 && heuristics.gitVelocity > 0) {
    signals.push({
      id: createId("sig_repo"),
      type: "repo-state",
      source: "repo-scan",
      summary: `All recent commits are AI-authored (${heuristics.aiVelocity}/wk). No human commits in the last 14 days — verify this work is intentional.`,
      evidenceRefs: [`repo:${projectId}:ai-only-commits`],
      freshnessScore: 0.85,
      confidence: 0.8,
      createdAt
    });
  } else if (heuristics.aiVelocity > heuristics.humanVelocity * 2 && heuristics.humanVelocity > 0) {
    signals.push({
      id: createId("sig_repo"),
      type: "repo-state",
      source: "repo-scan",
      summary: `AI commits (${heuristics.aiVelocity}/wk) far outnumber human commits (${heuristics.humanVelocity}/wk). Consider whether human review is keeping pace.`,
      evidenceRefs: [`repo:${projectId}:ai-dominant-commits`],
      freshnessScore: 0.8,
      confidence: 0.75,
      createdAt
    });
  }

  return signals;
};
