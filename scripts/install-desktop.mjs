import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const appName = "AI Native Project Backlog";
const installRoot = path.join(process.env.LOCALAPPDATA ?? path.join(projectRoot, ".local"), "Programs", appName);
const electronDist = path.join(projectRoot, "node_modules", "electron", "dist");
const projectNodeModules = path.join(projectRoot, "node_modules");

const resolveDesktopShortcutPath = () => {
  const candidates = [
    process.env.OneDriveCommercial ? path.join(process.env.OneDriveCommercial, "Desktop") : undefined,
    process.env.OneDrive ? path.join(process.env.OneDrive, "Desktop") : undefined,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "Desktop") : undefined
  ].filter(Boolean);

  const desktopDir = candidates.find((candidate) => fs.existsSync(candidate)) ?? path.join(projectRoot, "Desktop");
  return path.join(desktopDir, `${appName}.lnk`);
};

const desktopShortcut = resolveDesktopShortcutPath();

const ensurePathExists = async (targetPath, description) => {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} not found at ${targetPath}`);
  }
};

const copyIfPresent = async (source, destination) => {
  if (fs.existsSync(source)) {
    await fsp.cp(source, destination, { recursive: true, force: true });
  }
};

const writeLauncherManifest = async () => {
  const resourcesAppDir = path.join(installRoot, "resources", "app");
  await fsp.mkdir(resourcesAppDir, { recursive: true });

  const manifest = {
    name: "ai-native-project-backlog",
    productName: appName,
    version: "0.1.0",
    type: "module",
    main: "dist/desktop/desktop/main.js"
  };

  await fsp.writeFile(path.join(resourcesAppDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await copyIfPresent(path.join(projectRoot, "dist", "client"), path.join(resourcesAppDir, "dist", "client"));
  await copyIfPresent(path.join(projectRoot, "dist", "desktop"), path.join(resourcesAppDir, "dist", "desktop"));
  await copyIfPresent(path.join(projectRoot, "dist", "server"), path.join(resourcesAppDir, "dist", "server"));
  await copyIfPresent(path.join(projectRoot, ".env"), path.join(resourcesAppDir, ".env"));
  const packagedNodeModules = path.join(resourcesAppDir, "node_modules");
  await copyIfPresent(projectNodeModules, packagedNodeModules);
  await fsp.rm(path.join(packagedNodeModules, "electron"), { recursive: true, force: true });
};

const createDesktopShortcut = async () => {
  const executablePath = path.join(installRoot, "electron.exe");
  const appEntryPath = path.join(installRoot, "resources", "app");
  const iconPath = executablePath.replace(/'/g, "''");
  const targetPath = executablePath.replace(/'/g, "''");
  const shortcutPath = desktopShortcut.replace(/'/g, "''");
  const workingDirectory = installRoot.replace(/'/g, "''");
  const argumentsPath = appEntryPath.replace(/'/g, "''");

  const command = `
$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut('${shortcutPath}')
$Shortcut.TargetPath = '${targetPath}'
$Shortcut.Arguments = '"${argumentsPath}"'
$Shortcut.WorkingDirectory = '${workingDirectory}'
$Shortcut.IconLocation = '${iconPath},0'
$Shortcut.Save()
`.trim();

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { windowsHide: true }
  );
};

const install = async () => {
  await ensurePathExists(path.join(projectRoot, "dist", "client"), "Built client assets");
  await ensurePathExists(path.join(projectRoot, "dist", "desktop", "desktop", "main.js"), "Built desktop entrypoint");
  await ensurePathExists(electronDist, "Electron runtime");
  await ensurePathExists(projectNodeModules, "Project dependencies");

  await fsp.rm(installRoot, { recursive: true, force: true });
  await fsp.mkdir(installRoot, { recursive: true });
  await fsp.cp(electronDist, installRoot, { recursive: true, force: true });

  await writeLauncherManifest();
  await createDesktopShortcut();

  process.stdout.write(`Installed ${appName} to ${installRoot}\n`);
  process.stdout.write(`Desktop shortcut created at ${desktopShortcut}\n`);
};

install().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
