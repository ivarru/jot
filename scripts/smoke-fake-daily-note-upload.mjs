import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const baseUrl = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173/");
const chromePath = process.env.CHROME_PATH ?? findChrome();
const uploadDate = "2030-02-02";
const uploadMarkdown = "Uploaded daily note smoke";

if (!chromePath) {
  throw new Error("Chrome was not found. Set CHROME_PATH to run the fake Daily Note upload smoke test.");
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

const tempDir = await mkdtemp(join(tmpdir(), "jot-fake-daily-note-upload-smoke-"));
const notePath = join(tempDir, `${uploadDate}.md`);
await writeFile(notePath, uploadMarkdown);

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
    await cdp.send("DOM.enable");
    await cdp.send("Page.navigate", { url: baseUrl.href });
    await waitForExpression(cdp, "document.readyState === 'complete'");

    await clickButton(cdp, "Use development storage");
    await waitForExpression(cdp, "document.querySelector('input[accept=\".md,text/markdown\"]') !== null");
    await setFileInput(cdp, "input[accept='.md,text/markdown']", notePath);

    const note = await waitForUploadedDailyNote(cdp, uploadDate);
    assert(note.markdown === uploadMarkdown, `Expected uploaded markdown ${JSON.stringify(uploadMarkdown)}, got ${JSON.stringify(note.markdown)}.`);

    const successMessage = await waitForExpression(
      cdp,
      "document.body.textContent.includes('Uploaded 1 daily note.')",
      10000,
      true
    );
    assert(successMessage, "Expected Daily Note upload success message.");
    await clickButton(cdp, "Dismiss daily note upload message");
    await waitForExpression(cdp, "!document.body.textContent.includes('Uploaded 1 daily note.')");
  } finally {
    cdp.close();
  }
} finally {
  chrome?.kill();
  await rm(tempDir, { recursive: true, force: true });
}

console.log(`Fake Daily Note upload smoke passed for ${baseUrl.origin}`);

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

async function setFileInput(cdp, selector, filePath) {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  assert(nodeId, `Could not find file input ${selector}.`);
  await cdp.send("DOM.setFileInputFiles", { nodeId, files: [filePath] });
}

async function waitForUploadedDailyNote(cdp, date) {
  const expression = `new Promise((resolve, reject) => {
    const request = indexedDB.open('jot');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('fakeRemoteNotes', 'readonly');
      const store = transaction.objectStore('fakeRemoteNotes');
      const noteRequest = store.get(${JSON.stringify(date)});
      noteRequest.onerror = () => reject(noteRequest.error);
      noteRequest.onsuccess = () => resolve(noteRequest.result ?? null);
    };
  })`;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const note = await evaluate(cdp, expression, true);
    if (note !== null && typeof note === "object") return note;
    await delay(100);
  }
  throw new Error(`Timed out waiting for uploaded Daily Note ${date}.`);
}

async function waitForExpression(cdp, expression, timeoutMs = 10000, returnValue = false) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await evaluate(cdp, `Boolean(${expression})`);
    if (result) return returnValue ? result : undefined;
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
