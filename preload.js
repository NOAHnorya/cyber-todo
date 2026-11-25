// 把主进程的能力包装成页面认识的接口：window.claude.use("desktop")。
// index.html 原本是按 Claude 桌面端的同名接口写的，这里提供同样形状的对象，
// 所以同一个页面既能在 Claude 里装成应用，也能在这个独立外壳里运行。
const { contextBridge, ipcRenderer } = require("electron");

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

const hotkeys = new Map();
ipcRenderer.on("hotkey", (_event, accelerator) => {
  const cb = hotkeys.get(accelerator);
  if (cb) cb();
});

const GRANTED = { overlay: "granted", shortcuts: "granted", "full-access": "granted", notifications: "unavailable", "menu-bar": "unavailable" };
const WINDOW_OPTIONS = { frame: false, transparent: true, alwaysOnTop: true };

const desktop = {
  install: {
    state: async () => "installed",
    request: async () => "installed"
  },
  permissions: {
    state: async (name) => (name ? GRANTED[name] : { ...GRANTED }),
    request: async () => ({ ...GRANTED })
  },
  window: {
    // 窗口样式在 main.js 里创建时就定好了，这两个调用只需要如实回答。
    setOptions: async (options) => ({ applied: "now", reloading: false, options }),
    getOptions: async () => ({ options: WINDOW_OPTIONS, applied: WINDOW_OPTIONS }),
    getBounds: () => call("win:getBounds"),
    setBounds: (bounds) => call("win:setBounds", bounds),
    show: () => call("win:show"),
    hide: () => call("win:hide"),
    setIgnoreMouseEvents: (ignore, options) => call("win:ignore", !!ignore, options || null),
    setVisibleOnAllWorkspaces: (visible) => call("win:allWorkspaces", !!visible)
  },
  app: {
    dock: { setIcon: (pngDataUrl) => call("dock:icon", pngDataUrl) }
  },
  screen: {
    getCursorScreenPoint: () => call("screen:cursor"),
    getAllDisplays: () => call("screen:displays")
  },
  globalShortcut: {
    register: async (accelerator, callback) => {
      hotkeys.set(accelerator, callback);
      return call("hotkey:register", accelerator);
    }
  },
  fs: {
    exists: (p) => call("fs:exists", p),
    readFile: (p) => call("fs:readFile", p),
    writeFile: (p, text) => call("fs:writeFile", p, text),
    stat: (p) => call("fs:stat", p),
    mkdir: (p) => call("fs:mkdir", p)
  }
};

contextBridge.exposeInMainWorld("claude", {
  use: async (name) => (name === "desktop" ? desktop : null)
});
