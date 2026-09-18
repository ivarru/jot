const DB_NAME = "jot";
const DB_VERSION = 2;

export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
): Promise<T> {
  const database = await openDatabase();

  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let operationCompleted = false;
    let transactionCompleted = false;
    let operationResult: T;

    const resolveAfterCommit = () => {
      if (operationCompleted && transactionCompleted) resolve(operationResult);
    };
    const rejectOperation = (error: unknown) => {
      reject(error);
      try {
        transaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
    };

    transaction.oncomplete = () => {
      transactionCompleted = true;
      resolveAfterCommit();
    };
    transaction.onerror = () =>
      reject(transaction.error ?? new DOMException("The transaction failed.", "UnknownError"));
    transaction.onabort = () =>
      reject(transaction.error ?? new DOMException("The transaction was aborted.", "AbortError"));

    let pendingOperation: IDBRequest<T> | Promise<T>;
    try {
      pendingOperation = operation(store);
    } catch (error) {
      rejectOperation(error);
      return;
    }

    Promise.resolve(pendingOperation)
      .then((result) => {
        if (isIdbRequest<T>(result)) {
          result.onsuccess = () => {
            operationResult = result.result;
            operationCompleted = true;
            resolveAfterCommit();
          };
          result.onerror = () => rejectOperation(result.error);
        } else {
          operationResult = result;
          operationCompleted = true;
          resolveAfterCommit();
        }
      })
      .catch(rejectOperation);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains("drafts")) {
        database.createObjectStore("drafts", { keyPath: "date" });
      }

      if (!database.objectStoreNames.contains("fakeRemoteNotes")) {
        database.createObjectStore("fakeRemoteNotes", { keyPath: "date" });
      }

      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains("fakeImageAlbum")) {
        database.createObjectStore("fakeImageAlbum", { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains("fakeImageAttachmentMetadata")) {
        database.createObjectStore("fakeImageAttachmentMetadata", { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains("fakePhotoMediaItems")) {
        database.createObjectStore("fakePhotoMediaItems", { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isIdbRequest<T>(value: unknown): value is IDBRequest<T> {
  return typeof value === "object" && value !== null && "onsuccess" in value && "onerror" in value;
}
