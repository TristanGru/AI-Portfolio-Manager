import { MAX_LIST_ITEMS } from "../../shared/constants.js";
import type {
  ProjectStatus,
  Recommendation,
  RecommendationAction,
  SignalRecord
} from "../../shared/domain.js";
import { createId } from "../lib/ids.js";

const ACTION_BASELINES: Record<ProjectStatus, Record<RecommendationAction, number>> = {
  active: {
    build: 0.42,
    fix: 0.36,
    investigate: 0.24,
    reposition: 0.22,
    "maintenance-only": 0.08,
    archive: 0.04,
    kill: 0.02
  },
  "cool-down": {
    build: 0.18,
    fix: 0.24,
    investigate: 0.32,
    reposition: 0.3,
    "maintenance-only": 0.22,
    archive: 0.2,
    kill: 0.1
  },
  "maintenance-only": {
    build: 0.05,
    fix: 0.38,
    investigate: 0.2,
    reposition: 0.12,
    "maintenance-only": 0.36,
    archive: 0.24,
    kill: 0.14
  },
  "yet-to-start": {
    build: 0.7,
    fix: 0.05,
    investigate: 0.3,
    reposition: 0.1,
    "maintenance-only": 0.02,
    archive: 0.01,
    kill: 0.01
  },
  archived: {
    build: -10,
    fix: 0.12,
    investigate: 0.18,
    reposition: 0.05,
    "maintenance-only": 0.16,
    archive: 0.6,
    kill: 0.32
  }
};

const KEYWORD_GROUPS: Record<RecommendationAction, string[]> = {
  build: ["feature", "add", "improve", "expand", "launch", "support"],
  fix: ["bug", "broken", "error", "confusing", "slow", "fix"],
  investigate: ["weird", "unknown", "unclear", "investigate", "explore"],
  reposition: ["pivot", "focus", "direction", "audience", "thesis", "reposition"],
  "maintenance-only": ["stable", "maintenance", "hold", "keep alive"],
  archive: ["archive", "cool down", "pause", "shelve"],
  kill: ["kill", "stop", "dead", "abandon"]
};

const decaySignal = (signal: SignalRecord): number => {
  const ageInDays = Math.max(
    0,
    (Date.now() - new Date(signal.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const decayFactor = Math.max(0.35, 1 - ageInDays * 0.02);
  return signal.freshnessScore * signal.confidence * decayFactor;
};

const scoreSignalAgainstAction = (
  action: RecommendationAction,
  signal: SignalRecord
): number => {
  const haystack = `${signal.summary} ${signal.details ?? ""}`.toLowerCase();
  const keywordHits = KEYWORD_GROUPS[action].filter((keyword) => haystack.includes(keyword)).length;
  const keywordScore = keywordHits * 0.14;
  const feedbackBonus = signal.type === "feedback" && action === "fix" ? 0.18 : 0;
  const noteBonus = signal.type === "note" && action === "reposition" ? 0.1 : 0;
  const ideaBonus = signal.type === "idea" && action === "build" ? 0.12 : 0;
  const readinessBonus =
    signal.type === "repo-state" && action === "build" && haystack.includes("package manifest") ? 0.12 : 0;
  const activityBonus =
    signal.type === "repo-state" && haystack.includes("active work sessions")
      ? action === "build"
        ? 0.22
        : action === "archive" || action === "kill"
          ? -0.18
          : 0
      : 0;
  const emptyRepoPenalty =
    signal.type === "repo-state" && haystack.includes("no source files yet")
      ? action === "build"
        ? -0.55
        : action === "investigate" || action === "archive"
          ? 0.2
          : 0
      : 0;

  return (
    decaySignal(signal) * 0.2 +
    keywordScore +
    feedbackBonus +
    noteBonus +
    ideaBonus +
    readinessBonus +
    activityBonus +
    emptyRepoPenalty
  );
};

const createRationale = (
  actionType: RecommendationAction,
  signals: SignalRecord[],
  status: ProjectStatus
): { rationale: string; whatWouldChangeMind: string; evidenceRefs: string[] } => {
  const topSignals = signals.slice(0, 3);
  const evidenceRefs = topSignals.flatMap((signal) => signal.evidenceRefs).slice(0, 4);
  const statusLine =
    status === "archived"
      ? "The project is already archived, so the system avoids pretending a fresh build push is the right move."
      : `The project is currently ${status}, which changes how aggressive the next move should be.`;

  const rationale = `${statusLine} The strongest recent signals point toward ${actionType}: ${topSignals
    .map((signal) => signal.summary)
    .join(" ")}`;

  const whatWouldChangeMind =
    actionType === "build"
      ? "Stronger user pain around bugs or evidence that the project should narrow its thesis."
      : actionType === "fix"
        ? "Clear demand for a new capability that users keep asking for and the repo is ready to support."
        : actionType === "reposition"
          ? "Fresh evidence that the current thesis is working without confusion or drift."
          : actionType === "investigate"
            ? "A clearer implementation-ready repo state or repeated user demand for one concrete feature."
          : "A stronger cluster of recent user signals pointing to immediate product growth.";

  return { rationale, whatWouldChangeMind, evidenceRefs };
};

export const generateRecommendations = (
  projectId: string,
  status: ProjectStatus,
  signals: SignalRecord[]
): Recommendation[] => {
  const createdAt = new Date().toISOString();
  const orderedSignals = [...signals].sort((left, right) => decaySignal(right) - decaySignal(left));

  const scoredActions = (Object.keys(ACTION_BASELINES[status]) as RecommendationAction[]).map((actionType) => {
    const signalScore = orderedSignals.reduce(
      (total, signal) => total + scoreSignalAgainstAction(actionType, signal),
      0
    );
    const priorityScore = Number((ACTION_BASELINES[status][actionType] + signalScore).toFixed(3));
    const rationaleBits = createRationale(actionType, orderedSignals, status);

    return {
      id: createId("rec"),
      projectId,
      actionType,
      title: `${actionType[0].toUpperCase()}${actionType.slice(1)} next`,
      rationale: rationaleBits.rationale,
      evidenceRefs: rationaleBits.evidenceRefs.length ? rationaleBits.evidenceRefs : [`project:${projectId}`],
      confidence: Number(Math.min(0.98, 0.55 + Math.max(0, priorityScore) * 0.3).toFixed(2)),
      whatWouldChangeMind: rationaleBits.whatWouldChangeMind,
      priorityScore,
      createdAt
    } satisfies Recommendation;
  });

  return scoredActions.sort((left, right) => right.priorityScore - left.priorityScore).slice(0, 3);
};

export const createRecommendationMarkdown = (recommendations: Recommendation[]): string => {
  const [top, ...rest] = recommendations;

  if (!top) {
    return "# Current Recommendation\n\nNo recommendation available yet.";
  }

  return [
    "# Current Recommendation",
    "",
    `## Top Move: ${top.actionType}`,
    "",
    top.rationale,
    "",
    `Confidence: ${Math.round(top.confidence * 100)}%`,
    "",
    "Evidence:",
    ...top.evidenceRefs.map((ref) => `- ${ref}`),
    "",
    "What would change my mind:",
    `- ${top.whatWouldChangeMind}`,
    "",
    "Other ranked options:",
    ...rest.map((item) => `- ${item.actionType} (${item.priorityScore.toFixed(2)})`)
  ].join("\n");
};

export const createNextTaskMarkdown = (
  recommendations: Recommendation[],
  signals: SignalRecord[] = [],
  llmNextTask?: string
): string => {
  const [top] = recommendations;

  if (!top) {
    return "# Next Task\n\nNo task available yet.";
  }

  if (llmNextTask) {
    return [
      "# Next Task",
      "",
      llmNextTask,
      "",
      `Primary action: **${top.actionType}**`,
      `Confidence: ${Math.round(top.confidence * 100)}%`,
      "",
      "Evidence refs:",
      ...top.evidenceRefs.slice(0, MAX_LIST_ITEMS).map((ref) => `- ${ref}`)
    ].join("\n");
  }

  const topSignals = signals
    .sort((a, b) => decaySignal(b) - decaySignal(a))
    .slice(0, 3)
    .map((s) => `- ${s.summary}`)
    .join("\n");

  return [
    "# Next Task",
    "",
    `Primary action: **${top.actionType}**`,
    "",
    "Why this matters:",
    top.rationale,
    "",
    topSignals ? `Strongest signals driving this:\n${topSignals}` : "",
    "",
    "What to do:",
    `- Focus on a ${top.actionType} move — not a broad rewrite.`,
    `- Start from the evidence refs below before changing anything.`,
    `- If you can't justify the ${top.actionType} direction with evidence, stop and investigate first.`,
    "",
    "Evidence refs:",
    ...top.evidenceRefs.slice(0, MAX_LIST_ITEMS).map((ref) => `- ${ref}`)
  ].filter((line) => line !== undefined).join("\n");
};

export const createCodingAgentBriefMarkdown = (
  projectName: string,
  thesisMarkdown: string,
  recommendations: Recommendation[]
): string => {
  const [top] = recommendations;

  return [
    "# Coding Agent Brief",
    "",
    `Project: ${projectName}`,
    "",
    "Operating mode:",
    top ? `- Bias toward ${top.actionType}, not generic expansion.` : "- No active recommendation yet.",
    top ? `- Confidence: ${Math.round(top.confidence * 100)}%` : "- Confidence: n/a",
    "",
    "Current thesis:",
    ...thesisMarkdown
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => (line.startsWith("#") ? line.replace(/^#+\s*/, "- ") : `- ${line}`)),
    "",
    "Instruction:",
    top
      ? "- Start from the latest recommendation rationale and evidence refs before changing code."
      : "- Read project memory before making changes.",
    top ? "- Preserve the product thesis unless fresh evidence clearly contradicts it." : "- Do not widen scope by default.",
    top ? `- If you cannot justify a ${top.actionType} move with evidence, stop and ask.` : "- If the direction is unclear, investigate first.",
    "",
    "Evidence refs:",
    ...(top?.evidenceRefs.length ? top.evidenceRefs.map((ref) => `- ${ref}`) : ["- No evidence refs available yet."])
  ].join("\n");
};
