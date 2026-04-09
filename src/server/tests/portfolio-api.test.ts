import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createTempPortfolio } from "./test-helpers.js";
import fs from "node:fs/promises";

describe("portfolio api", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths.splice(0).map(async (targetPath) => {
        await fs.rm(targetPath, { recursive: true, force: true });
      })
    );
  });

  it("loads a portfolio and returns ranked projects", async () => {
    const rootPath = await createTempPortfolio();
    cleanupPaths.push(rootPath);

    const app = createApp();
    const response = await request(app).post("/api/portfolio/load").send({ rootPath });

    expect(response.status).toBe(200);
    expect(response.body.projects.length).toBeGreaterThan(0);
    expect(response.body.projects[0]).toHaveProperty("topRecommendationType");
    expect(response.body.watcherStatus.watchedProjectCount).toBeGreaterThan(0);
  });

  it("appends a signal and returns refreshed detail", async () => {
    const rootPath = await createTempPortfolio();
    cleanupPaths.push(rootPath);

    const app = createApp();
    const loadResponse = await request(app).post("/api/portfolio/load").send({ rootPath });
    const projectId = loadResponse.body.projects[0].id;

    const response = await request(app)
      .post(`/api/projects/${projectId}/signals`)
      .query({ rootPath })
      .send({
        type: "idea",
        source: "manual",
        summary: "Add a better weekly ranking view"
      });

    expect(response.status).toBe(200);
    expect(response.body.signals.some((signal: { summary: string }) => signal.summary.includes("weekly"))).toBe(true);
    expect(response.body.recommendations.length).toBeGreaterThan(0);
    expect(response.body.agentBriefMarkdown).toContain("Coding Agent Brief");
  });
});
