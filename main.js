// 赛博待办的 Electron 外壳：一个无边框、透明、置顶的窗口，
// 外加页面需要的几样系统能力（窗口位置、鼠标穿透、全局快捷键、读写待办文件）。
const { app, BrowserWindow, ipcMain, screen, globalShortcut, nativeImage } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");

// 页面里把数据目录写作 ~/cyber-todo；这里是它在磁盘上的真实位置。
const VIRTUAL_DIR = "~/cyber-todo";
const DATA_DIR = process.env.CYBER_TODO_DIR || path.join(os.homedir(), "cyber-todo");

// 自测时连浏览器存储也放进临时目录，免得测试数据混进真实的待办里。
if (process.env.CYBER_TODO_SELFTEST) app.setPath("userData", path.join(DATA_DIR, ".selftest-profile"));

let win = null;

// 页面只能碰数据目录里的文件，其他路径一律拒绝。
function resolveDataPath(p) {
  if (typeof p !== "string") throw new Error("EINVAL: path must be a string");
  if (p !== VIRTUAL_DIR && !p.startsWith(VIRTUAL_DIR + "/")) throw new Error("EPERM: outside the data folder");
  const abs = path.resolve(DATA_DIR, "." + p.slice(VIRTUAL_DIR.length));
  if (abs !== DATA_DIR && !abs.startsWith(DATA_DIR + path.sep)) throw new Error("EPERM: outside the data folder");
  return abs;
}

const handlers = {
  "win:getBounds": () => win.getBounds(),
  "win:setBounds": (b) => {
    const cur = win.getBounds();
    const next = { ...cur };
    for (const k of ["x", "y", "width", "height"]) if (Number.isFinite(b && b[k])) next[k] = Math.round(b[k]);
    win.setBounds(next);
  },
  "win:show": () => { win.show(); win.focus(); },
  "win:hide": () => { win.hide(); },
  "win:ignore": (ignore, options) => {
    win.setIgnoreMouseEvents(!!ignore, { forward: !!(options && options.forward) });
  },
  "win:allWorkspaces": (visible) => {
    win.setVisibleOnAllWorkspaces(!!visible, { visibleOnFullScreen: false, skipTransformProcessType: true });
  },
  "dock:icon": (dataUrl) => {
    if (!app.dock || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png")) return { written: false };
    app.dock.setIcon(nativeImage.createFromDataURL(dataUrl));
    return { written: true };
  },
  "screen:cursor": () => screen.getCursorScreenPoint(),
  "screen:displays": () => screen.getAllDisplays().map((d) => ({
    id: d.id, label: d.label, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor, internal: d.internal
  })),
  "hotkey:register": (accelerator) => {
    if (typeof accelerator !== "string") return false;
    if (globalShortcut.isRegistered(accelerator)) globalShortcut.unregister(accelerator);
    return globalShortcut.register(accelerator, () => {
      if (win && !win.isDestroyed()) win.webContents.send("hotkey", accelerator);
    });
  },
  "fs:exists": async (p) => fs.access(resolveDataPath(p)).then(() => true, () => false),
  "fs:readFile": async (p) => fs.readFile(resolveDataPath(p), "utf8"),
  "fs:writeFile": async (p, text) => {
    if (typeof text !== "string") throw new Error("EINVAL: text must be a string");
    await fs.writeFile(resolveDataPath(p), text, "utf8");
  },
  "fs:stat": async (p) => {
    const s = await fs.stat(resolveDataPath(p));
    return { size: s.size, mtimeMs: s.mtimeMs, isFile: s.isFile(), isDirectory: s.isDirectory() };
  },
  "fs:mkdir": async (p) => { await fs.mkdir(resolveDataPath(p), { recursive: true }); }
};

function createWindow() {
  win = new BrowserWindow({
    width: 384, height: 700,
    frame: false, transparent: true, backgroundColor: "#00000000", hasShadow: false,
    alwaysOnTop: true, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, acceptFirstMouse: true, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setAlwaysOnTop(true, "floating");
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.once("ready-to-show", () => win.showInactive());
  win.on("closed", () => { win = null; });
  win.loadFile(path.join(__dirname, "index.html"));
  if (process.env.CYBER_TODO_SELFTEST) require("./scripts/selftest.js")(win, DATA_DIR);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(() => {
    for (const [channel, fn] of Object.entries(handlers)) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!win || event.sender !== win.webContents) throw new Error("EPERM: unknown sender");
        return fn(...args);
      });
    }
    createWindow();
  });
  app.on("will-quit", () => globalShortcut.unregisterAll());
  app.on("window-all-closed", () => app.quit());
}
