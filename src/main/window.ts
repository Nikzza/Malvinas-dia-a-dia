import { BrowserWindow } from "electron";
import path from "node:path";

export function createMainWindow() {
  const window = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: "#0d1b2a",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(process.cwd(), "dist", "renderer", "index.html"));
  }

  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  return window;
}
