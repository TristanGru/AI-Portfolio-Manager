import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainJs = path.join(__dirname, "../dist/desktop/desktop/main.js");

// Claude Code sets ELECTRON_RUN_AS_NODE=1 which makes Electron behave as plain Node.js.
// We must delete the key entirely before spawning the actual desktop app.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [mainJs], { stdio: "inherit", env });
child.on("close", (code) => process.exit(code ?? 0));
