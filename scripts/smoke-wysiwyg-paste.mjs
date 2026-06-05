import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/");
const chromePath = process.env.CHROME_PATH ?? findChrome();
const pastedUrl = "https://example.com/a:b?x=1";
const expectedMarkdown = `<${pastedUrl}>\n`;

if (!chromePath) {
  throw new Error("Chrome was not found. Set CHROME_PATH to run the WYSIWYG paste smoke test.");
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

const tempDir = await mkdtemp(join(tmpdir(), "jot-wysiwyg-paste-smoke-"));
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
  const browser = new CdpClient(browserWsUrl);
  await browser.open();
  try {
    await browser.send("Browser.grantPermissions", {
      origin: baseUrl.origin,
      permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"]
    });
    await browser.send("Browser.setPermission", {
      origin: baseUrl.origin,
      permission: { name: "clipboard-read" },
      setting: "granted"
    });
    await browser.send("Browser.setPermission", {
      origin: baseUrl.origin,
      permission: { name: "clipboard-write" },
      setting: "granted"
    });
  } finally {
    browser.close();
  }

  const pageWsUrl = await waitForPageWsUrl(browserWsUrl);
  const cdp = new CdpClient(pageWsUrl);
  await cdp.open();
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: baseUrl.href });
    await waitForExpression(cdp, "document.readyState === 'complete'");
    await cdp.send("Page.bringToFront");

    await clickButton(cdp, "Use development storage");
    await waitForExpression(cdp, "document.querySelector('.milkdown-root [contenteditable=\"true\"]') !== null");
    await delay(500);
    await cdp.send("Page.bringToFront");
    await clickWysiwygEditor(cdp);
    await writeClipboard(cdp, pastedUrl);
    await pasteFromBrowserClipboard(cdp);
    await switchToRawMode(cdp);
    await waitForRawMarkdown(cdp, expectedMarkdown);

    const markdown = await rawMarkdown(cdp);
    assert(!markdown.includes("\\:"), `Expected pasted URL markdown not to escape colons, got ${JSON.stringify(markdown)}.`);
  } finally {
    cdp.close();
  }
} finally {
  await stopProcess(chrome);
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log(`WYSIWYG paste smoke passed for ${baseUrl.origin}`);

async function writeClipboard(cdp, text) {
  const result = await evaluate(cdp, `(async () => {
    try {
      await navigator.clipboard.writeText(${JSON.stringify(text)});
      return { ok: true };
    } catch (error) {
      const permission = navigator.permissions
        ? await navigator.permissions.query({ name: "clipboard-write" }).then((status) => status.state).catch(() => "unknown")
        : "unavailable";
      return {
        ok: false,
        clipboardAvailable: Boolean(navigator.clipboard),
        permission,
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  })()`, true);
  assert(result?.ok === true, `Could not write URL to the browser clipboard: ${JSON.stringify(result)}.`);
}

async function clickWysiwygEditor(cdp) {
  const point = await evaluate(cdp, `(() => {
    const editor = document.querySelector('.milkdown-root [contenteditable="true"]');
    if (!(editor instanceof HTMLElement)) return null;
    editor.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = editor.getBoundingClientRect();
    return { x: rect.left + Math.min(rect.width / 2, 20), y: rect.top + Math.min(rect.height / 2, 20) };
  })()`);
  assert(point !== null, "Could not find the WYSIWYG editor.");
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  const focused = await evaluate(cdp, `(() => {
    const editor = document.querySelector('.milkdown-root [contenteditable="true"]');
    if (!(editor instanceof HTMLElement)) return false;
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return document.activeElement === editor;
  })()`);
  assert(focused, "Could not focus the WYSIWYG editor.");
}

async function pasteFromBrowserClipboard(cdp) {
  await dispatchPasteShortcut(cdp, process.platform === "darwin");
  const containsPaste = await waitForWysiwygText(cdp, pastedUrl);
  assert(containsPaste, "WYSIWYG editor did not receive the pasted URL.");
  const hasLink = await evaluate(cdp, `(() => {
    const link = document.querySelector('.milkdown-root a[href=${JSON.stringify(pastedUrl)}]');
    return link instanceof HTMLAnchorElement && link.textContent === ${JSON.stringify(pastedUrl)};
  })()`);
  assert(hasLink, "WYSIWYG editor did not render the pasted URL as a link.");
  await delay(500);
}

async function dispatchPasteShortcut(cdp, useMac) {
  const modifier = useMac
    ? { key: "Meta", code: "MetaLeft", windowsVirtualKeyCode: 91, nativeVirtualKeyCode: 91, modifiers: 4 }
    : { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 2 };

  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...modifier });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "v",
    code: "KeyV",
    windowsVirtualKeyCode: 86,
    nativeVirtualKeyCode: 86,
    modifiers: modifier.modifiers,
    commands: ["Paste"]
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "v",
    code: "KeyV",
    windowsVirtualKeyCode: 86,
    nativeVirtualKeyCode: 86,
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

async function waitForWysiwygText(cdp, text) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (await wysiwygContains(cdp, text)) return true;
    await delay(100);
  }
  return false;
}

async function wysiwygContains(cdp, text) {
  return await evaluate(cdp, `(() => {
    const editor = document.querySelector('.milkdown-root [contenteditable="true"]');
    return editor instanceof HTMLElement && editor.textContent.includes(${JSON.stringify(text)});
  })()`);
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
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      process.stderr.off("data", onData);
      process.off("exit", onExit);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const timeout = setTimeout(
      () => settle(reject, new Error(`Chrome did not expose a DevTools URL. ${stderr}`)),
      10000
    );
    const onData = (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      settle(resolve, match[1]);
    };
    const onExit = (code, signal) => {
      settle(reject, new Error(`Chrome exited before DevTools became available with code ${code}, signal ${signal}. ${stderr}`));
    };
    process.stderr.on("data", onData);
    process.on("exit", onExit);
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
    returnByValue: true,
    userGesture: true
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
