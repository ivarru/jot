import { expect, type Page } from "@playwright/test";

export interface FakeRemoteNote {
  readonly date: string;
  readonly markdown: string;
  readonly revisionId: string | null;
  readonly updatedAt: string;
}

export async function seedLocalDraft(page: Page, date: string, markdown: string): Promise<void> {
  await page.evaluate(
    async ({ noteDate, noteMarkdown }) => {
      const database = await openSmokeDatabase();
      try {
        const transaction = database.transaction("drafts", "readwrite");
        transaction.objectStore("drafts").put({
          date: noteDate,
          markdown: noteMarkdown,
          baselineMarkdown: noteMarkdown,
          baselineRevisionId: null,
          dirty: true,
          updatedAt: "2030-01-01T00:00:00.000Z"
        });
        await waitForSmokeTransaction(transaction);
      } finally {
        database.close();
      }

      function openSmokeDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open("jot", 2);
          request.onupgradeneeded = () => ensureSmokeStores(request.result);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      function ensureSmokeStores(database: IDBDatabase): void {
        if (!database.objectStoreNames.contains("drafts")) database.createObjectStore("drafts", { keyPath: "date" });
        if (!database.objectStoreNames.contains("fakeRemoteNotes")) database.createObjectStore("fakeRemoteNotes", { keyPath: "date" });
        if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "id" });
        if (!database.objectStoreNames.contains("fakeImageAlbum")) database.createObjectStore("fakeImageAlbum", { keyPath: "id" });
        if (!database.objectStoreNames.contains("fakeImageAttachmentMetadata")) {
          database.createObjectStore("fakeImageAttachmentMetadata", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("fakePhotoMediaItems")) database.createObjectStore("fakePhotoMediaItems", { keyPath: "id" });
      }

      function waitForSmokeTransaction(transaction: IDBTransaction): Promise<void> {
        return new Promise((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      }
    },
    { noteDate: date, noteMarkdown: markdown }
  );
}

export async function seedConflictState(
  page: Page,
  input: {
    readonly date: string;
    readonly baseline: string;
    readonly local: string;
    readonly remote: string;
  }
): Promise<void> {
  await page.evaluate(async (state) => {
    localStorage.setItem("jot.fakeAuth", "true");
    const database = await openSmokeDatabase();
    try {
      const transaction = database.transaction(["drafts", "fakeRemoteNotes"], "readwrite");
      transaction.objectStore("drafts").put({
        date: state.date,
        markdown: state.local,
        baselineMarkdown: state.baseline,
        baselineRevisionId: "baseline-revision",
        dirty: true,
        updatedAt: "2030-01-01T00:00:00.000Z"
      });
      transaction.objectStore("fakeRemoteNotes").put({
        date: state.date,
        markdown: state.remote,
        revisionId: "remote-revision",
        updatedAt: "2030-01-01T00:00:00.000Z"
      });
      await waitForSmokeTransaction(transaction);
    } finally {
      database.close();
    }

    function openSmokeDatabase(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("jot", 2);
        request.onupgradeneeded = () => ensureSmokeStores(request.result);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    function ensureSmokeStores(database: IDBDatabase): void {
      if (!database.objectStoreNames.contains("drafts")) database.createObjectStore("drafts", { keyPath: "date" });
      if (!database.objectStoreNames.contains("fakeRemoteNotes")) database.createObjectStore("fakeRemoteNotes", { keyPath: "date" });
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "id" });
      if (!database.objectStoreNames.contains("fakeImageAlbum")) database.createObjectStore("fakeImageAlbum", { keyPath: "id" });
      if (!database.objectStoreNames.contains("fakeImageAttachmentMetadata")) {
        database.createObjectStore("fakeImageAttachmentMetadata", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("fakePhotoMediaItems")) database.createObjectStore("fakePhotoMediaItems", { keyPath: "id" });
    }

    function waitForSmokeTransaction(transaction: IDBTransaction): Promise<void> {
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }
  }, input);
}

export async function readFakeRemoteNote(page: Page, date: string): Promise<FakeRemoteNote | null> {
  return await page.evaluate(async (noteDate) => {
    const database = await openSmokeDatabase();
    try {
      const transaction = database.transaction("fakeRemoteNotes", "readonly");
      const request = transaction.objectStore("fakeRemoteNotes").get(noteDate);
      return (await waitForSmokeRequest<FakeRemoteNote | undefined>(request)) ?? null;
    } finally {
      database.close();
    }

    function openSmokeDatabase(): Promise<IDBDatabase> {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("jot", 2);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    function waitForSmokeRequest<T>(request: IDBRequest<T>): Promise<T> {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
  }, date);
}

export async function waitForFakeRemoteNote(
  page: Page,
  date: string,
  expectedMarkdown?: string
): Promise<FakeRemoteNote> {
  let note: FakeRemoteNote | null = null;
  await expect.poll(async () => {
    note = await readFakeRemoteNote(page, date);
    if (expectedMarkdown === undefined) return note !== null;
    return note?.markdown === expectedMarkdown;
  }).toBe(true);
  return note!;
}

export async function waitForSavedImageMarkdown(page: Page): Promise<string> {
  let markdown = "";
  await expect.poll(async () => {
    markdown = await page.evaluate(async () => {
      const database = await openSmokeDatabase();
      try {
        const transaction = database.transaction("fakeRemoteNotes", "readonly");
        const request = transaction.objectStore("fakeRemoteNotes").getAll();
        const notes = await waitForSmokeRequest<FakeRemoteNote[]>(request);
        return notes.find((note) => note.markdown.includes("jot:image:"))?.markdown ?? "";
      } finally {
        database.close();
      }

      function openSmokeDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open("jot", 2);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      function waitForSmokeRequest<T>(request: IDBRequest<T>): Promise<T> {
        return new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
    });
    return markdown.includes("jot:image:");
  }, { timeout: 10_000 }).toBe(true);
  return markdown;
}
