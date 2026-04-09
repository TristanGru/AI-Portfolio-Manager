import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ingestArtifactSignals } from "../services/artifact-ingestion-service.js";
import { createTempPortfolio } from "./test-helpers.js";

describe("ingestArtifactSignals", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map(async (targetPath) => {
        await fs.rm(targetPath, { recursive: true, force: true });
      })
    );
  });

  it("turns common notes and bug files into automatic signals", async () => {
    const rootPath = await createTempPortfolio();
    cleanupPaths.push(rootPath);
    const projectPath = path.join(rootPath, "project-alpha");

    await fs.writeFile(
      path.join(projectPath, "BUGS.md"),
      ["# Bugs", "", "- Dashboard sort order feels broken", "- Weekly digest misses archived projects"].join("\n"),
      "utf8"
    );
    await fs.writeFile(
      path.join(projectPath, "ideas.md"),
      ["# Ideas", "", "- Add a sharper weekly digest mode"].join("\n"),
      "utf8"
    );

    const signals = await ingestArtifactSignals("project-alpha", projectPath);

    expect(signals.some((signal) => signal.type === "feedback" && signal.summary.includes("broken"))).toBe(true);
    expect(signals.some((signal) => signal.type === "idea" && signal.summary.includes("weekly digest"))).toBe(true);
  });
});
