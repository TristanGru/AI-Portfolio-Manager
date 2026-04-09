import fs from "node:fs/promises";
import path from "node:path";
import type { SignalRecord } from "../../shared/domain.js";
import { logError } from "../lib/logger.js";
import type { RepoHeuristics } from "./repo-scanner.js";

type LlmRationaleResult = {
  rationale: string;
  whatWouldChangeMind: string;
  nextTask: string;
};

const buildRationalePrompt = (
  projectName: string,
  status: string,
  heuristics: RepoHeuristics,
  thesisSummary: string,
  topSignals: SignalRecord[]
): string => {
  const signalLines = topSignals
    .slice(0, 5)
    .map((s) => `- ${s.type}: ${s.summary}`)
    .join("\n");

  return [
    `Project: ${projectName}`,
    `Status: ${status}`,
    `Git velocity: ${heuristics.gitVelocity} commits/week (${heuristics.humanVelocity} human, ${heuristics.aiVelocity} AI)`,
    `Last commit: ${heuristics.gitLastCommitAgeDays} days ago`,
    `Thesis: ${thesisSummary.replace(/^#+.*/gm, "").trim().slice(0, 300)}`,
    `TODO density: ${heuristics.todoDensity} TODOs/FIXMEs`,
    `README: ${heuristics.readmeCompleteness}/4`,
    `Tests: ${heuristics.testsPresent ? "present and recent" : "none"}`,
    `Dependencies: ${heuristics.depsPresent ? "present" : "none"}`,
    "",
    "Recent signals:",
    signalLines || "- none",
    "",
    "---",
    "",
    "You are a smart PM reviewing a solo developer's side project. Given the signals above, write:",
    "1. A 2-3 sentence recommendation in plain English — what to do next and why. Be specific to this project, not generic.",
    "2. One sentence on what evidence would change this recommendation.",
    "3. A concrete next task: one specific thing to do this week, written as a direct instruction (e.g. 'Add X to Y so that Z'). Be specific to the actual project state — reference real signals, commit patterns, or README gaps if relevant.",
    "",
    "Sound like a colleague, not a consultant. Be direct.",
    "",
    'Respond only with JSON: {"rationale": "...", "whatWouldChangeMind": "...", "nextTask": "..."}'
  ].join("\n");
};

export const generateLlmRationale = async (
  projectName: string,
  status: string,
  heuristics: RepoHeuristics,
  thesisSummary: string,
  topSignals: SignalRecord[]
): Promise<LlmRationaleResult | null> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const prompt = buildRationalePrompt(projectName, status, heuristics, thesisSummary, topSignals);

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }]
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logError("llm.rationale.parse_failed", { projectName, text: text.slice(0, 200) });
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as { rationale?: string; whatWouldChangeMind?: string; nextTask?: string };

    if (!parsed.rationale || !parsed.whatWouldChangeMind) {
      logError("llm.rationale.missing_fields", { projectName, parsed });
      return null;
    }

    return {
      rationale: parsed.rationale,
      whatWouldChangeMind: parsed.whatWouldChangeMind,
      nextTask: parsed.nextTask ?? ""
    };
  } catch (error) {
    logError("llm.rationale.failed", { projectName, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
};

const readFileIfPresent = async (filePath: string, maxChars = 3000): Promise<string> => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.slice(0, maxChars);
  } catch {
    return "";
  }
};

const getRecentGitLog = async (projectPath: string): Promise<string> => {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const result = await execFileAsync("git", ["log", "--oneline", "-20"], { cwd: projectPath, timeout: 5000 });
    return result.stdout.trim();
  } catch {
    return "";
  }
};

const findReadme = async (projectPath: string): Promise<string> => {
  try {
    const entries = await fs.readdir(projectPath);
    const readmeFile = entries.find((e) => /^readme/i.test(e));
    if (!readmeFile) return "";
    return readFileIfPresent(path.join(projectPath, readmeFile));
  } catch {
    return "";
  }
};

export const generateProjectThesis = async (
  projectName: string,
  projectPath: string
): Promise<string | null> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const [readme, gitLog] = await Promise.all([
    findReadme(projectPath),
    getRecentGitLog(projectPath)
  ]);

  if (!readme && !gitLog) return null;

  const context = [
    readme ? `README:\n${readme}` : "",
    gitLog ? `Recent commits:\n${gitLog}` : ""
  ].filter(Boolean).join("\n\n");

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const prompt = [
      `Project name: ${projectName}`,
      "",
      context,
      "",
      "---",
      "",
      "Based only on the above, write a short project thesis in this exact markdown format:",
      "",
      "## Product",
      "(one sentence: what this project is)",
      "",
      "## User",
      "(one sentence: who uses it and their core problem)",
      "",
      "## Current promise",
      "(one sentence: what it promises to deliver)",
      "",
      "## Drift warnings",
      "- (one or two things that could pull it off course)",
      "",
      "Be specific to this project. Do not invent facts not in the README or commits.",
      "If context is too thin, write the most honest version you can infer.",
      "Respond only with the markdown, no preamble."
    ].join("\n");

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }]
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!text) return null;

    return `# Project Thesis\n\n${text}`;
  } catch (error) {
    logError("llm.thesis.failed", { projectName, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
};
