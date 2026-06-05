import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/");
const chromePath = process.env.CHROME_PATH ?? findChrome();

if (!chromePath) {
  throw new Error("Chrome was not found. Set CHROME_PATH to run the raw keyboard smoke test.");
}

class CdpClient {
  #nextId = 1;
  #pending = new Map();
  #socket;

  constructor(url) {
    this.url = url;
  }

  open() {
    this.#socket = new WebSocket(this.url);
    this.#socket.addEventListener("message", (event) => this.#handleMessage(event));
    return new Promise((resolve, reject) => {
      this.#socket.addEventListener("open", resolve, { once: true });
      this.#socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.#socket?.close();
  }

  #handleMessage(event) {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result);
    }
  }
}

const tempDir = await mkdtemp(join(tmpdir(), "jot-raw-keyboard-smoke-"));
let chrome;
try {
  chrome = spawn(chromePath, [
    "--headless=new",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--remote-debugging-port=0",
    `--user-data-dir=${join(tempDir, "profile")}`,
    "about:blank"
  ], {
    stdio: ["ignore", "ignore", "pipe"]
  });

  const browserWsUrl = await waitForDevToolsUrl(chrome);
  const pageWsUrl = await waitForPageWsUrl(browserWsUrl);
  const cdp = new CdpClient(pageWsUrl);
  await cdp.open();
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: baseUrl.href });
    await waitForExpression(cdp, "document.readyState === 'complete'");

    await clickButton(cdp, "Use development storage");
    await switchToRawMode(cdp);

    await assertRawTabUndo(cdp, "plain line", "* plain line");
    await assertRawTabUndo(cdp, "# Heading", "## Heading");
  } finally {
    cdp.close();
  }
} finally {
  await stopProcess(chrome);
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log(`Raw keyboard smoke passed for ${baseUrl.origin}`);

async function assertRawTabUndo(cdp, before, afterTab) {
  await setRawMarkdown(cdp, before);
  await pressTab(cdp);
  await waitForRawMarkdown(cdp, afterTab);
  await pressUndo(cdp);
  if ((await rawMarkdown(cdp)) !== before) {
    await pressUndo(cdp, process.platform !== "darwin");
  }
  await waitForRawMarkdown(cdp, before);
}

async function switchToRawMode(cdp) {
  await waitForExpression(cdp, "document.querySelector('.raw-mode-toggle input') !== null");
  const switched = await evaluate(cdp, `(() => {
    const input = document.querySelector('.raw-mode-toggle input');
    if (!(input instanceof HTMLInputElement)) return false;
    if (!input.checked) input.click();
    return true;
  })()`);
  assert(switched, "Could not switch to raw mode.");
  await waitForExpression(cdp, "document.querySelector('textarea[aria-label=\"Markdown text editor\"]') !== null");
}

async function setRawMarkdown(cdp, markdown) {
  const focused = await evaluate(cdp, `(() => {
    const textarea = document.querySelector('textarea[aria-label="Markdown text editor"]');
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    textarea.focus();
    textarea.select();
    return true;
  })()`);
  assert(focused, "Could not focus raw markdown editor.");
  await pressBackspace(cdp);
  await waitForRawMarkdown(cdp, "");
  await cdp.send("Input.insertText", { text: markdown });
  await waitForRawMarkdown(cdp, markdown);
}

async function waitForRawMarkdown(cdp, expected) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const value = await rawMarkdown(cdp);
    if (value === expected) return;
    await delay(100);
  }
  throw new Error(`Expected raw markdown ${JSON.stringify(expected)}, got ${JSON.stringify(await rawMarkdown(cdp))}.`);
}

async function rawMarkdown(cdp) {
  return await evaluate(cdp, `(() => {
    const textarea = document.querySelector('textarea[aria-label="Markdown text editor"]');
    return textarea instanceof HTMLTextAreaElement ? textarea.value : null;
  })()`);
}

async function pressTab(cdp) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9
  });
}

async function pressBackspace(cdp) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
    nativeVirtualKeyCode: 8
  });
}

async function pressUndo(cdp, useMac = process.platform === "darwin") {
  const isMac = useMac;
  const modifier = isMac
    ? { key: "Meta", code: "MetaLeft", windowsVirtualKeyCode: 91, nativeVirtualKeyCode: 91, modifiers: 4 }
    : { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 2 };

  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...modifier });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "z",
    code: "KeyZ",
    windowsVirtualKeyCode: 90,
    nativeVirtualKeyCode: 90,
    modifiers: modifier.modifiers,
    commands: ["Undo"]
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "z",
    code: "KeyZ",
    windowsVirtualKeyCode: 90,
    nativeVirtualKeyCode: 90,
    modifiers: modifier.modifiers
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: modifier.key,
    code: modifier.code,
    windowsVirtualKeyCode: modifier.windowsVirtualKeyCode,
    nativeVirtualKeyCode: modifier.nativeVirtualKeyCode
  });
}

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function waitForDevToolsUrl(process) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Chrome did not expose a DevTools URL. ${stderr}`)), 10000);
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    process.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools became available with code ${code}. ${stderr}`));
    });
  });
}

async function waitForPageWsUrl(browserWsUrl) {
  const browserUrl = new URL(browserWsUrl);
  const listUrl = `http://${browserUrl.host}/json/list`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const targets = await fetch(listUrl).then((response) => response.json()).catch(() => []);
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (page) return page.webSocketDebuggerUrl;
    await delay(100);
  }
  throw new Error("Chrome did not expose a page debugging target.");
}

async function clickButton(cdp, text) {
  const clicked = await evaluate(cdp, `(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes(${JSON.stringify(text)}) ||
      candidate.getAttribute('aria-label')?.includes(${JSON.stringify(text)})
    );
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not find button containing ${text}.`);
}

async function waitForExpression(cdp, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await evaluate(cdp, `Boolean(${expression})`);
    if (result) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed.");
  }
  return result.result.value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcess(process) {
  if (!process || process.exitCode !== null || process.signalCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    process.kill();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
