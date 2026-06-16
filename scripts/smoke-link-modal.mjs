import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/");
const chromePath = process.env.CHROME_PATH ?? findChrome();

if (!chromePath) {
  throw new Error("Chrome was not found. Set CHROME_PATH to run the link modal smoke test.");
}

await assertManifestShareTarget();

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

const tempDir = await mkdtemp(join(tmpdir(), "jot-link-modal-smoke-"));
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
    await grantClipboardPermissions(browser);

    const pageWsUrl = await waitForPageWsUrl(browserWsUrl);
    const cdp = new CdpClient(pageWsUrl);
    await cdp.open();
    try {
      await cdp.send("Page.enable");
      await cdp.send("Runtime.enable");
      await navigate(cdp, baseUrl.href);
      await grantClipboardPermissions(browser);
      await clickButton(cdp, "Use development storage");
      await switchToRawMode(cdp);

      await assertClipboardAutoFill(cdp);
      await assertManualLinkModalInsert(cdp);
      await assertClipboardButtonLinkEdit(cdp);
      await assertExistingLinkEdit(cdp);
      await assertShareTargetInsert(cdp);
    } finally {
      cdp.close();
    }
  } finally {
    browser.close();
  }
} finally {
  await stopProcess(chrome);
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log(`Link modal smoke passed for ${baseUrl.origin}`);

async function grantClipboardPermissions(browser) {
  await browser.send("Browser.grantPermissions", {
    origin: baseUrl.origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"]
  });
}

async function assertManifestShareTarget() {
  const response = await fetch(new URL("manifest.webmanifest", baseUrl));
  assert(response.ok, `manifest.webmanifest returned HTTP ${response.status}.`);
  const manifest = await response.json();
  assert(manifest.share_target?.action === ".", "manifest share_target.action is not '.'.");
  assert(manifest.share_target?.method === "GET", "manifest share_target.method is not GET.");
  assert(manifest.share_target?.params?.title === "title", "manifest share_target title param is missing.");
  assert(manifest.share_target?.params?.text === "text", "manifest share_target text param is missing.");
  assert(manifest.share_target?.params?.url === "url", "manifest share_target url param is missing.");
}

async function assertManualLinkModalInsert(cdp) {
  const markdown = "Read selected text today";
  await setRawMarkdown(cdp, markdown);
  await writeClipboardText(cdp, "");
  await focusRawEditorRange(cdp, markdown.indexOf("selected text"), markdown.indexOf("selected text") + "selected text".length);

  await clickButton(cdp, "Insert or edit link");
  await waitForLinkModal(cdp);
  await waitForLinkModalValues(cdp, {
    text: "selected text",
    url: ""
  });
  await setLinkModalUrl(cdp, "https://example.com/clipboard");
  await clickButton(cdp, "Insert");
  await waitForRawMarkdown(cdp, "Read [selected text](<https://example.com/clipboard>) today");
}

async function assertClipboardAutoFill(cdp) {
  await setRawMarkdown(cdp, "");
  await writeClipboardText(cdp, "Clipboard title https://example.com/auto-fill");
  await focusRawEditorRange(cdp, 0, 0);

  await clickButton(cdp, "Insert or edit link");
  await waitForLinkModal(cdp);
  await waitForLinkModalValues(cdp, {
    text: "Clipboard title",
    url: "https://example.com/auto-fill"
  });
  await clickButton(cdp, "Insert");
  await waitForRawMarkdown(cdp, "[Clipboard title](<https://example.com/auto-fill>)");
}

async function assertExistingLinkEdit(cdp) {
  const markdown = "Read [old text](<https://example.com/old>) today";
  await setRawMarkdown(cdp, markdown);
  await focusRawEditorRange(cdp, markdown.indexOf("old text"), markdown.indexOf("old text"));

  await clickButton(cdp, "Insert or edit link");
  await waitForLinkModal(cdp);
  await waitForLinkModalValues(cdp, {
    text: "old text",
    url: "https://example.com/old"
  });
  await setLinkModalUrl(cdp, "https://example.com/new");
  await clickButton(cdp, "Update");
  await waitForRawMarkdown(cdp, "Read [old text](<https://example.com/new>) today");
}

async function assertClipboardButtonLinkEdit(cdp) {
  const markdown = "Read [old text](<https://example.com/old>) today";
  await setRawMarkdown(cdp, markdown);
  await writeClipboardText(cdp, "Clipboard title https://example.com/from-smoke");
  await focusRawEditorRange(cdp, markdown.indexOf("old text"), markdown.indexOf("old text"));

  await clickButton(cdp, "Insert or edit link");
  await waitForLinkModal(cdp);
  await waitForLinkModalValues(cdp, {
    text: "old text",
    url: "https://example.com/old"
  });
  await waitForExpression(
    cdp,
    `document.querySelector('button[aria-label="Use clipboard text"]')?.disabled === false &&
      document.querySelector('button[aria-label="Use clipboard URL"]')?.disabled === false`
  );

  await clickButton(cdp, "Use clipboard text");
  await waitForLinkModalValues(cdp, {
    text: "Clipboard title",
    url: "https://example.com/old"
  });

  await clickButton(cdp, "Use clipboard URL");
  await waitForLinkModalValues(cdp, {
    text: "Clipboard title",
    url: "https://example.com/from-smoke"
  });
  await clickButton(cdp, "Update");
  await waitForRawMarkdown(cdp, "Read [Clipboard title](<https://example.com/from-smoke>) today");
}

async function assertShareTargetInsert(cdp) {
  const shareUrl = new URL(baseUrl);
  shareUrl.searchParams.set("title", "Shared title");
  shareUrl.searchParams.set("url", "https://example.com/shared");
  await navigate(cdp, shareUrl.href);
  await waitForLinkModal(cdp);
  await waitForLinkModalValues(cdp, {
    text: "Shared title",
    url: "https://example.com/shared"
  });
  await clickButton(cdp, "Insert");
  await switchToRawMode(cdp);
  await waitForRawMarkdownContains(cdp, "[Shared title](<https://example.com/shared>)");
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await waitForExpression(cdp, "document.readyState === 'complete'");
  await cdp.send("Page.bringToFront");
}

async function switchToRawMode(cdp) {
  await waitForExpression(cdp, "document.querySelector('button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]') !== null");
  const switched = await evaluate(cdp, `(() => {
    const button = document.querySelector('button.raw-mode-toggle[aria-label="Toggle raw Markdown"]');
    if (!(button instanceof HTMLButtonElement)) return false;
    if (button.getAttribute("aria-pressed") !== "true") button.click();
    return true;
  })()`);
  assert(switched, "Could not switch to raw mode.");
  await waitForExpression(cdp, "document.querySelector('textarea[aria-label=\"Markdown text editor\"]') !== null");
}

async function setRawMarkdown(cdp, markdown) {
  await switchToRawMode(cdp);
  const replaced = await evaluate(cdp, `(() => {
    const textarea = document.querySelector('textarea[aria-label="Markdown text editor"]');
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    textarea.value = ${JSON.stringify(markdown)};
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(markdown)} }));
    return true;
  })()`);
  assert(replaced, "Could not replace raw markdown.");
  await waitForRawMarkdown(cdp, markdown);
}

async function focusRawEditorRange(cdp, start, end) {
  const focused = await evaluate(cdp, `(() => {
    const textarea = document.querySelector('textarea[aria-label="Markdown text editor"]');
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    textarea.focus();
    textarea.setSelectionRange(${start}, ${end});
    return document.activeElement === textarea &&
      textarea.selectionStart === ${start} &&
      textarea.selectionEnd === ${end};
  })()`);
  assert(focused, `Could not focus raw editor range ${start}-${end}.`);
}

async function writeClipboardText(cdp, text) {
  const result = await evaluate(cdp, `navigator.clipboard.writeText(${JSON.stringify(text)}).then(() => true).catch(() => false)`, true);
  assert(result === true, "Could not write link modal smoke text to the clipboard.");
  const readBack = await evaluate(cdp, `navigator.clipboard.readText().then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, name: error?.name ?? null, message: error?.message ?? String(error) })
  )`, true);
  const permissions = await evaluate(cdp, `Promise.all([
    navigator.permissions.query({ name: "clipboard-read" }).then((status) => status.state).catch((error) => error?.name ?? String(error)),
    navigator.permissions.query({ name: "clipboard-read", allowWithoutGesture: true }).then((status) => status.state).catch((error) => error?.name ?? String(error))
  ])`, true);
  assert(
    readBack?.ok === true && readBack.value === text,
    `Could not read back link modal smoke clipboard text; result ${JSON.stringify(readBack)}, permissions ${JSON.stringify(permissions)}.`
  );
}

async function waitForLinkModal(cdp) {
  await waitForExpression(cdp, "document.querySelector('.link-modal') !== null");
}

async function waitForLinkModalValues(cdp, expected) {
  const expression = `(() => {
    const inputs = [...document.querySelectorAll('.link-modal input')];
    return inputs[0]?.value === ${JSON.stringify(expected.text)} &&
      inputs[1]?.value === ${JSON.stringify(expected.url)};
  })()`;
  const started = Date.now();
  while (Date.now() - started < 5000) {
    if (await evaluate(cdp, expression)) return;
    await delay(100);
  }
  const actual = await evaluate(cdp, `(() => {
    const inputs = [...document.querySelectorAll('.link-modal input')];
    return inputs.map((input) => input.value);
  })()`);
  throw new Error(`Expected link modal values ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
}

async function setLinkModalUrl(cdp, url) {
  const updated = await evaluate(cdp, `(() => {
    const inputs = [...document.querySelectorAll('.link-modal input')];
    const urlInput = inputs[1];
    if (!(urlInput instanceof HTMLInputElement)) return false;
    urlInput.value = ${JSON.stringify(url)};
    urlInput.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(url)} }));
    return true;
  })()`);
  assert(updated, "Could not update link modal URL.");
  await waitForLinkModalValues(cdp, {
    text: await evaluate(cdp, `document.querySelectorAll('.link-modal input')[0]?.value ?? ""`),
    url
  });
}

async function waitForRawMarkdown(cdp, expected) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const value = await rawMarkdown(cdp);
    if (normalizeMarkdown(value) === expected) return;
    await delay(100);
  }
  throw new Error(`Expected raw markdown ${JSON.stringify(expected)}, got ${JSON.stringify(await rawMarkdown(cdp))}.`);
}

async function waitForRawMarkdownContains(cdp, expected) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const value = await rawMarkdown(cdp);
    if (normalizeMarkdown(value).includes(expected)) return;
    await delay(100);
  }
  throw new Error(`Expected raw markdown to contain ${JSON.stringify(expected)}, got ${JSON.stringify(await rawMarkdown(cdp))}.`);
}

async function rawMarkdown(cdp) {
  return await evaluate(cdp, `(() => {
    const textarea = document.querySelector('textarea[aria-label="Markdown text editor"]');
    return textarea instanceof HTMLTextAreaElement ? textarea.value : null;
  })()`);
}

function normalizeMarkdown(value) {
  return typeof value === "string" && value.endsWith("\n") ? value.slice(0, -1) : value;
}

async function clickButton(cdp, text) {
  const point = await evaluate(cdp, `(() => {
    const buttons = [...document.querySelectorAll('button')];
    const exact = buttons.find((candidate) =>
      candidate.textContent?.trim() === ${JSON.stringify(text)} ||
      candidate.getAttribute('aria-label') === ${JSON.stringify(text)}
    );
    const button = exact ?? buttons.find((candidate) =>
      candidate.textContent?.includes(${JSON.stringify(text)}) ||
      candidate.getAttribute('aria-label')?.includes(${JSON.stringify(text)})
    );
    if (!(button instanceof HTMLButtonElement)) return null;
    button.scrollIntoView({ block: "center", inline: "center" });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  assert(point !== null, `Could not find button containing ${text}.`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
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
