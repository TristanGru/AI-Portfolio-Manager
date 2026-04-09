import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createTempPortfolio = async (): Promise<string> => {
  const fixtureRoot = path.resolve(__dirname, "../../test/fixtures/portfolio");
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ai-backlog-"));
  await fs.cp(fixtureRoot, tempRoot, { recursive: true });
  return tempRoot;
};
