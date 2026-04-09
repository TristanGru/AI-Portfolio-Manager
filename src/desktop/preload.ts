import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopBridge", {
  isDesktop: true,
  selectPortfolioRoot: () => ipcRenderer.invoke("portfolio:select-root") as Promise<string | undefined>
});
