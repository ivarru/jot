import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/");
const chromePath = process.env.CHROME_PATH ?? findChrome();
const date = "2030-02-02";
const baseline = "before\nold\nsame\nafter\n";
const local = "before\nlocal\nsame\nafter\n";
const remote = "before\nremote\nsame\nafter\n";
const resolved = "resolved note\n";

if (!chromePath) {
  throw new Error("Chrome was not found. Set CHROME_PATH to run the fake reconnect conflict smoke test.");
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

const tempDir = await mkdtemp(join(tmpdir(), "jot-fake-reconnect-conflict-smoke-"));
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
    await waitForExpression(cdp, "document.querySelector('.sync-status[aria-label*=\"Local only\"], .sync-status[aria-label*=\"Synced\"]') !== null");
    await seedConflictState(cdp);
    await cdp.send("Page.navigate", { url: new URL(`#/date/${date}`, baseUrl).href });
    await waitForExpression(cdp, "document.querySelector('.sync-status[aria-label*=\"Saved locally\"]') !== null");

    await clickButton(cdp, "Saved locally");
    await waitForExpression(cdp, "document.body.textContent.includes('Sync conflict')");
    await waitForExpression(cdp, "document.querySelector('button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]')?.disabled === true");

    await clickButton(cdp, "Resolve manually");
    await waitForExpression(cdp, "document.querySelector('.plain-text-editor')?.value.includes('<<<<<<< Local Draft')");
    await waitForExpression(cdp, "document.querySelector('button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]')?.getAttribute('aria-pressed') === 'true'");
    await waitForExpression(cdp, "document.querySelector('button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]')?.disabled === true");

    await setTextAreaValue(cdp, ".plain-text-editor", resolved);
    await waitForExpression(cdp, "document.querySelector('button.raw-mode-toggle[aria-label=\"Toggle raw Markdown\"]')?.disabled === false");
    await clickButton(cdp, "Conflict");
    const note = await waitForFakeRemoteNote(cdp, date, resolved);
    assert(note.markdown === resolved, `Expected resolved markdown ${JSON.stringify(resolved)}, got ${JSON.stringify(note.markdown)}.`);
  } finally {
    cdp.close();
  }
} finally {
  chrome?.kill();
  await rm(tempDir, { recursive: true, force: true });
}

console.log(`Fake reconnect conflict smoke passed for ${baseUrl.origin}`);

async function seedConflictState(cdp) {
  await evaluate(cdp, `new Promise((resolve, reject) => {
    localStorage.setItem('jot.fakeAuth', 'true');
    const request = indexedDB.open('jot', 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('drafts')) database.createObjectStore('drafts', { keyPath: 'date' });
      if (!database.objectStoreNames.contains('fakeRemoteNotes')) database.createObjectStore('fakeRemoteNotes', { keyPath: 'date' });
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('fakeImageAlbum')) database.createObjectStore('fakeImageAlbum', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('fakeImageAttachmentMetadata')) database.createObjectStore('fakeImageAttachmentMetadata', { keyPath: 'id' });
      if (!database.objectStoreNames.contains('fakePhotoMediaItems')) database.createObjectStore('fakePhotoMediaItems', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['drafts', 'fakeRemoteNotes'], 'readwrite');
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(true);
      transaction.objectStore('drafts').put({
        date: ${JSON.stringify(date)},
        markdown: ${JSON.stringify(local)},
        baselineMarkdown: ${JSON.stringify(baseline)},
        baselineRevisionId: 'baseline-revision',
        dirty: true,
        updatedAt: '2030-01-01T00:00:00.000Z'
      });
      transaction.objectStore('fakeRemoteNotes').put({
        date: ${JSON.stringify(date)},
        markdown: ${JSON.stringify(remote)},
        revisionId: 'remote-revision',
        updatedAt: '2030-01-01T00:00:00.000Z'
      });
    };
  })`, true);
}

async function setTextAreaValue(cdp, selector, value) {
  const changed = await evaluate(cdp, `(() => {
    const textarea = document.querySelector(${JSON.stringify(selector)});
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    textarea.value = ${JSON.stringify(value)};
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(value)} }));
    return true;
  })()`);
  assert(changed, `Could not set textarea ${selector}.`);
}

async function waitForFakeRemoteNote(cdp, noteDate, expectedMarkdown) {
  const expression = `new Promise((resolve, reject) => {
    const request = indexedDB.open('jot');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('fakeRemoteNotes', 'readonly');
      const store = transaction.objectStore('fakeRemoteNotes');
      const noteRequest = store.get(${JSON.stringify(noteDate)});
      noteRequest.onerror = () => reject(noteRequest.error);
      noteRequest.onsuccess = () => resolve(noteRequest.result ?? null);
    };
  })`;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const note = await evaluate(cdp, expression, true);
    if (note !== null && typeof note === "object" && note.markdown === expectedMarkdown) return note;
    await delay(100);
  }
  throw new Error(`Timed out waiting for fake remote note ${noteDate}.`);
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
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not find enabled button containing ${text}.`);
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
