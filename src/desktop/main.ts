import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import { config as loadEnv } from "dotenv";
import { createApp } from "../server/app.js";

// Electron exports CJS; use createRequire for reliable named bindings in ESM main process
const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog, ipcMain } = require("electron") as typeof import("electron");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env — try project root relative to compiled output, then CWD (dev fallback)
loadEnv({ path: path.join(__dirname, "../../../.env") });
loadEnv({ path: path.join(process.cwd(), ".env") });
let localServer: Server | undefined;

const startLocalServer = async (): Promise<string> => {
  process.env.NODE_ENV = "production";

  if (localServer) {
    const address = localServer.address();
    if (address && typeof address !== "string") {
      return `http://127.0.0.1:${address.port}`;
    }
  }

  const expressApp = createApp();

  localServer = await new Promise<Server>((resolve) => {
    const nextServer = expressApp.listen(0, "127.0.0.1", () => resolve(nextServer));
  });

  const address = localServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve desktop server address.");
  }

  return `http://127.0.0.1:${address.port}`;
};

const createMainWindow = async () => {
  const baseUrl = await startLocalServer();
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    autoHideMenuBar: true,
    title: "AI-Native Project Backlog",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await window.loadURL(baseUrl);
};

ipcMain.handle("portfolio:select-root", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose your portfolio root",
    properties: ["openDirectory", "dontAddToRecent"]
  });

  return result.canceled ? undefined : result.filePaths[0];
});

app.whenReady().then(async () => {
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  if (localServer) {
    await new Promise<void>((resolve, reject) => {
      localServer?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    }).catch(() => undefined);
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
