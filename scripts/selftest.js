// 自测：CYBER_TODO_SELFTEST=1 CYBER_TODO_DIR=<临时目录> npx electron .
// 启动应用，走一遍“快捷键呼出 → 添加任务 → 写入文件 → 外部改文件”，把结果打印成 JSON 后退出。
const fs = require("node:fs/promises");
const path = require("node:path");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = function selftest(win, dataDir) {
  const { app } = require("electron");
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const file = path.join(dataDir, "todo.md");

  win.webContents.once("did-finish-load", async () => {
    const out = {};
    try {
      await wait(1500);
      out.htmlClass = await js("document.documentElement.className");
      out.startsCollapsed = await js("document.body.classList.contains('collapsed')");
      out.bounds = win.getBounds();
      out.fileCreated = await fs.access(file).then(() => true, () => false);

      win.webContents.send("hotkey", "Alt+Shift+T");
      await wait(600);
      out.openAfterHotkey = await js("!document.body.classList.contains('collapsed')");
      out.hotkeyLabel = await js("document.getElementById('hk').textContent");

      await js(`(() => {
        const input = document.getElementById("input");
        const add = (text) => { input.value = text; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); };
        document.getElementById("pchip").click();   // 中 -> 低
        add("selftest low");
        add("!selftest high");
      })()`);
      await wait(500);
      out.fileAfterAdd = (await fs.readFile(file, "utf8")).split("\n").filter((l) => l.startsWith("- ["));

      await fs.appendFile(file, "- [ ] added by another program\n");
      await wait(3200);
      out.rowsAfterExternalEdit = await js("[...document.querySelectorAll('.row .txt')].map((n) => n.textContent)");

      out.outsideWriteBlocked = await js(`claude.use("desktop").then((d) => d.fs.writeFile("~/elsewhere.txt", "x")).then(() => false, () => true)`);
      out.status = await js("document.getElementById('status').textContent");
    } catch (err) {
      out.error = String(err && err.stack || err);
    }
    console.log("SELFTEST " + JSON.stringify(out));
    app.exit(out.error ? 1 : 0);
  });
};
