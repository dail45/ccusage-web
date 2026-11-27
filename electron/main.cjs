"use strict";

const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const HOST = "127.0.0.1";
const PREFERRED_PORT = 4243;
const PORT_ATTEMPTS = 20;
const REPO_ROOT = path.join(__dirname, "..");
const USE_STANDALONE = app.isPackaged || process.env.ELECTRON_SERVER === "standalone";

let mainWindow = null;
let serverProc = null; // utilityProcess or ChildProcess
let serverKind = null; // "utility" | "child"
let serverExited = false;
let serverExitInfo = "";
let stderrLines = [];
let serverPort = 0;
let saveTimer = null;

// ---------------------------------------------------------------- state file

function stateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8")) || {};
  } catch {
    return {};
  }
}

function writeState(patch) {
  try {
    const next = { ...readState(), ...patch };
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("[electron] failed to write state:", err);
  }
}

// ---------------------------------------------------------------------- port

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, HOST, () => srv.close(() => resolve(true)));
  });
}

async function pickPort() {
  const saved = readState().port;
  const first = Number.isInteger(saved) && saved > 0 && saved < 65536 ? saved : PREFERRED_PORT;
  const candidates = [first];
  for (let i = 0; i <= PORT_ATTEMPTS; i++) {
    const p = PREFERRED_PORT + i;
    if (!candidates.includes(p)) candidates.push(p);
  }
  for (const p of candidates) {
    if (await isPortFree(p)) {
      writeState({ port: p });
      return p;
    }
  }
  // Last resort: let the OS pick a free port.
  const p = await new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, HOST, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
  writeState({ port: p });
  return p;
}

// -------------------------------------------------------------------- server

function recordOutput(chunk, isErr) {
  const text = chunk.toString();
  (isErr ? process.stderr : process.stdout).write(text);
  if (isErr) {
    stderrLines.push(...text.split(/\r?\n/).filter(Boolean));
    if (stderrLines.length > 200) stderrLines = stderrLines.slice(-200);
  }
}

function nativeCcusageBin(serverDir) {
  const exe = process.platform === "win32" ? "ccusage.exe" : "ccusage";
  const p = path.join(
    serverDir,
    "node_modules",
    "@ccusage",
    `ccusage-${process.platform}-${process.arch}`,
    "bin",
    exe,
  );
  return fs.existsSync(p) ? p : null;
}

function startStandaloneServer(port) {
  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(REPO_ROOT, ".next", "standalone");
  const entry = path.join(serverDir, "server.js");
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Standalone server not found: ${entry}\nRun "npm run electron:build-next" first.`,
    );
  }
  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: HOST,
    NODE_ENV: "production",
    CCUSAGE_INSTALL_METHOD: INSTALL_METHOD,
  };
  const bin = nativeCcusageBin(serverDir);
  if (bin) env.CCUSAGE_BIN = bin;

  const proc = utilityProcess.fork(entry, [], { cwd: serverDir, env, stdio: "pipe" });
  serverProc = proc;
  serverKind = "utility";
  if (proc.stdout) proc.stdout.on("data", (d) => recordOutput(d, false));
  if (proc.stderr) proc.stderr.on("data", (d) => recordOutput(d, true));
  proc.on("exit", (code) => {
    serverExited = true;
    serverExitInfo = `Server exited with code ${code}`;
  });
}

function startDevServer(port) {
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--port", String(port), "--hostname", HOST],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        CCUSAGE_INSTALL_METHOD: INSTALL_METHOD,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  serverProc = child;
  serverKind = "child";
  child.stdout.on("data", (d) => recordOutput(d, false));
  child.stderr.on("data", (d) => recordOutput(d, true));
  child.on("error", (err) => {
    serverExited = true;
    serverExitInfo = `Failed to start server: ${err.message}`;
  });
  child.on("exit", (code, signal) => {
    serverExited = true;
    serverExitInfo = `Server exited with ${signal ? "signal " + signal : "code " + code}`;
  });
}

function killServer() {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  const proc = serverProc;
  if (!proc) return;
  serverProc = null;
  try {
    if (serverKind === "child" && process.platform === "win32" && proc.pid) {
      // Kill the whole tree: next dev spawns worker processes.
      spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      proc.kill();
    }
  } catch (err) {
    console.error("[electron] failed to kill server:", err);
  }
}

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverExited) throw new Error(serverExitInfo || "Server process exited");
    if (await probe(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${url}`);
}

// -------------------------------------------------------------------- window

function isLocalUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && u.hostname === HOST && Number(u.port) === serverPort;
  } catch {
    return false;
  }
}

function openExternalIfWeb(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") shell.openExternal(url);
  } catch {
    /* ignore invalid URLs */
  }
}

function saveBounds() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const maximized = win.isMaximized();
  const patch = { maximized };
  if (!maximized && !win.isMinimized() && !win.isFullScreen()) {
    patch.bounds = win.getBounds();
  }
  writeState(patch);
}

function scheduleSaveBounds() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveBounds, 500);
}

function resolveWindowIcon() {
  const filename = process.platform === "win32" ? "icon.ico" : "icon.png";
  const candidate = path.join(REPO_ROOT, "build", filename);
  return fs.existsSync(candidate) ? candidate : undefined;
}

function createWindow() {
  const state = readState();
  const b = state.bounds;
  const hasBounds =
    b &&
    [b.x, b.y, b.width, b.height].every((n) => Number.isFinite(n)) &&
    b.width > 0 &&
    b.height > 0;
  const windowIcon = resolveWindowIcon();

  mainWindow = new BrowserWindow({
    width: hasBounds ? b.width : 1440,
    height: hasBounds ? b.height : 900,
    ...(hasBounds ? { x: b.x, y: b.y } : {}),
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    title: "ccusage",
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (state.maximized) mainWindow.maximize();

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
  });
  mainWindow.on("resize", scheduleSaveBounds);
  mainWindow.on("move", scheduleSaveBounds);
  mainWindow.on("close", () => {
    clearTimeout(saveTimer);
    saveBounds();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfWeb(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isLocalUrl(url)) {
      event.preventDefault();
      openExternalIfWeb(url);
    }
  });
  return mainWindow;
}

// ----------------------------------------------------------------- auto-update

const RELEASES_URL = "https://github.com/dail45/ccusage-web/releases";
const IS_PORTABLE = process.platform === "win32" && Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
const CAN_AUTO_INSTALL = app.isPackaged && !IS_PORTABLE && process.platform !== "darwin";
const INSTALL_METHOD = !app.isPackaged
  ? "electron-dev"
  : IS_PORTABLE
    ? "electron-portable"
    : process.platform === "darwin"
      ? "electron-mac"
      : process.platform === "linux"
        ? "electron-appimage"
        : "electron-nsis";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let updateState = {
  currentVersion: app.getVersion(),
  installMethod: INSTALL_METHOD,
  canAutoInstall: CAN_AUTO_INSTALL,
  isPackaged: app.isPackaged,
  status: "idle",
  version: null,
  releaseUrl: RELEASES_URL,
  progress: null,
  error: null,
};
let updateCheckInFlight = false;
let updateCheckManual = false;
let updateCheckTimer = null;

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:state", updateState);
  }
}

async function runUpdateCheck(manual = false) {
  if (!app.isPackaged) {
    if (manual) {
      setUpdateState({ status: "unsupported", error: null, progress: null });
    }
    return updateState;
  }
  if (updateCheckInFlight) return updateState;
  updateCheckInFlight = true;
  updateCheckManual = manual;
  try {
    setUpdateState({ status: "checking", error: null, progress: null });
    await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error("[updater] check failed:", message);
    if (manual) {
      setUpdateState({ status: "error", error: message, progress: null });
    } else {
      setUpdateState({ status: "idle", error: null, progress: null });
    }
  } finally {
    updateCheckInFlight = false;
    updateCheckManual = false;
  }
  return updateState;
}

function setupAutoUpdater() {
  const appUpdateCfg = path.join(process.resourcesPath || "", "app-update.yml");
  if (app.isPackaged && !fs.existsSync(appUpdateCfg)) {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: "dail45",
      repo: "ccusage-web",
    });
  }
  autoUpdater.autoDownload = CAN_AUTO_INSTALL;
  autoUpdater.autoInstallOnAppQuit = CAN_AUTO_INSTALL;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    setUpdateState({ status: "checking", error: null });
  });

  autoUpdater.on("update-available", (info) => {
    const version = info && info.version ? info.version : null;
    setUpdateState({
      status: "available",
      version,
      releaseUrl: version ? `${RELEASES_URL}/tag/v${version}` : `${RELEASES_URL}/latest`,
      progress: null,
      error: null,
    });
  });

  autoUpdater.on("update-not-available", () => {
    setUpdateState({
      status: "not-available",
      version: null,
      progress: null,
      error: null,
    });
  });

  autoUpdater.on("download-progress", (p) => {
    setUpdateState({
      status: "downloading",
      progress: typeof p?.percent === "number" ? Math.round(p.percent) : null,
      error: null,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const version = info && info.version ? info.version : updateState.version;
    setUpdateState({
      status: "downloaded",
      version,
      releaseUrl: version ? `${RELEASES_URL}/tag/v${version}` : `${RELEASES_URL}/latest`,
      progress: 100,
      error: null,
    });
  });

  autoUpdater.on("error", (err) => {
    const message = err && err.message ? err.message : String(err);
    console.error("[updater] error:", message);
    if (updateCheckManual || updateState.status === "downloading") {
      setUpdateState({ status: "error", error: message, progress: null });
    } else {
      setUpdateState({ status: "idle", error: null, progress: null });
    }
  });

  ipcMain.handle("updater:get-state", () => updateState);
  ipcMain.handle("updater:check", () => runUpdateCheck(true));
  ipcMain.handle("updater:download", async () => {
    if (!app.isPackaged) return;
    if (CAN_AUTO_INSTALL) {
      await autoUpdater.downloadUpdate();
    } else {
      openExternalIfWeb(updateState.releaseUrl || `${RELEASES_URL}/latest`);
    }
  });
  ipcMain.handle("updater:install", () => {
    if (!CAN_AUTO_INSTALL) {
      openExternalIfWeb(updateState.releaseUrl || `${RELEASES_URL}/latest`);
      return;
    }
    killServer();
    autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.handle("updater:open-releases", () => {
    openExternalIfWeb(updateState.releaseUrl || RELEASES_URL);
  });
}

// ----------------------------------------------------------------- lifecycle

function fatal(err) {
  const tail = stderrLines.slice(-20).join("\n");
  const msg = (err && err.message ? err.message : String(err)) + (tail ? "\n\n" + tail : "");
  dialog.showErrorBox("ccusage failed to start", msg);
  killServer();
  app.quit();
}

async function main() {
  try {
    setupAutoUpdater();
    serverPort = await pickPort();
    if (USE_STANDALONE) startStandaloneServer(serverPort);
    else startDevServer(serverPort);

    const win = createWindow();
    const url = `http://${HOST}:${serverPort}/`;
    await waitForServer(url, USE_STANDALONE ? 30_000 : 60_000);
    if (win.isDestroyed()) return;
    await win.loadURL(url);

    if (app.isPackaged) {
      setTimeout(() => {
        runUpdateCheck(false);
      }, 5000);
      updateCheckTimer = setInterval(() => {
        runUpdateCheck(false);
      }, UPDATE_CHECK_INTERVAL_MS);
    }
  } catch (err) {
    fatal(err);
  }
}

if (process.platform === "win32") app.setAppUserModelId("com.dail45.ccusage-web");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(main);

  app.on("window-all-closed", () => {
    killServer();
    app.quit();
  });
  app.on("before-quit", killServer);
  app.on("will-quit", killServer);
}
