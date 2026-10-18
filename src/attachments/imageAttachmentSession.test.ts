import { ImageAttachmentFlow } from "./imageAttachmentFlow";
import { GooglePhotosAttachmentProvider } from "~/photos/googlePhotosAttachments";
import { sessionScopedProvider } from "~/auth/sessionScopedProvider";
import { resolveImageAttachmentResolution } from "~/domain/imageAttachments";
function json(value: unknown) { return new Response(JSON.stringify(value), {headers: {"Content-Type": "application/json"}}); }
it("does not upload an old-session image with a replacement session token", async () => {
  let token = "synthetic-account-A";
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  const uploads: RequestInit[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).startsWith("https://lh3.googleusercontent.com/")) { started(); await held; return new Response("synthetic-private-image", {headers: {"Content-Type": "image/jpeg"}}); }
    if (String(url).endsWith("/uploads")) { uploads.push(init!); return new Response("synthetic-upload-token"); }
    return json({newMediaItemResults: [{mediaItem: {id: "synthetic-copy"}}]});
  });
  const tokens = { getAccessToken: async () => token, captureSession: () => { const own = token; return () => own === token; } };
  const photos = new GooglePhotosAttachmentProvider(tokens, fetchFn as typeof fetch);
  const metadata = { loadJotImageAlbum: async () => ({version: 1 as const, albumId: "synthetic-album-A", title: "jot", createdAt: "2030-01-01T00:00:00.000Z"}), saveJotImageAlbum: async () => {}, loadImageAttachmentMetadata: async () => null, findImageAttachmentMetadataByMediaItemId: async () => null, saveImageAttachmentMetadata: async () => {} };
  const flow = new ImageAttachmentFlow(photos, metadata, tokens);
  const pending = flow.importPickedImage({picked: {id: "synthetic-source-A", type: "PHOTO", mediaFile: {baseUrl: "https://lh3.googleusercontent.com/p/review", mimeType: "image/jpeg"}}, selectedResolution: resolveImageAttachmentResolution("original"), altText: "review"});
  await start;
  localStorage.setItem("jot.accountEpoch", "signed-out");
  token = "synthetic-account-B";
  release(); const outcome = await pending.catch(error => error);
  expect(uploads.filter(init => new Headers(init.headers).get("Authorization") === "Bearer synthetic-account-B")).toEqual([]);
  expect(outcome).toMatchObject({name: "GoogleAuthCancelledError"});
});

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

it.each(["album-read", "album-create", "photo-upload"])("stops subsequent effects when %s crosses sign-out", async stage => {
  let active = true;
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>(resolve => {release = resolve;});
  const ready = new Promise<void>(resolve => {started = resolve;});
  const pause = async (at: string) => {if (stage === at) {started(); await held;}};
  const photos = {
    createPickingSession: vi.fn(), getPickingSession: vi.fn(), listPickedMediaItems: vi.fn(), getMediaItem: vi.fn(),
    createAlbum: vi.fn(async () => { await pause("album-create"); return {id: "album", title: "jot"}; }),
    downloadPickedImage: vi.fn(async () => new Blob(["image"], {type: "image/jpeg"})),
    uploadImageToAlbum: vi.fn(async () => {await pause("photo-upload"); return {id: "copy"};})
  };
  const drive = {
    loadJotImageAlbum: vi.fn(async () => {await pause("album-read"); return null;}),
    saveJotImageAlbum: vi.fn(async () => {}), loadImageAttachmentMetadata: vi.fn(),
    findImageAttachmentMetadataByMediaItemId: vi.fn(), saveImageAttachmentMetadata: vi.fn(async () => {})
  };
  const flow = new ImageAttachmentFlow(photos, drive, {captureSession: () => () => active});
  const pending = flow.importPickedImage({picked: {id: "source", type: "PHOTO", mediaFile: {baseUrl: "https://lh3.googleusercontent.com/source", mimeType: "image/jpeg"}}, selectedResolution: resolveImageAttachmentResolution("original"), altText: "image"});
  await ready; active = false; release();
  await expect(pending).rejects.toMatchObject({name: "GoogleAuthCancelledError"});
  expect(drive.saveImageAttachmentMetadata).not.toHaveBeenCalled();
  if (stage !== "photo-upload") expect(photos.uploadImageToAlbum).not.toHaveBeenCalled();
  if (stage === "album-create") expect(drive.saveJotImageAlbum).not.toHaveBeenCalled();
});

it("does not return a local clipboard/camera/file source prepared in an ended session", async () => {
  let active = true;
  let loaded!: () => void;
  vi.stubGlobal("URL", class extends URL {static createObjectURL() {return "blob:held";} static revokeObjectURL() {}});
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    naturalWidth = 1; naturalHeight = 1;
    set src(_value: string) {loaded = () => this.onload?.();}
  });
  const flow = new ImageAttachmentFlow({} as GooglePhotosAttachmentProvider, {} as never, {captureSession: () => () => active});
  const prepared = flow.prepareLocalImageSource({kind: "clipboard", bytes: new Blob(["image"], {type: "image/png"})});
  active = false; loaded();
  await expect(prepared).rejects.toMatchObject({name: "GoogleAuthCancelledError"});
});

it("a local image cannot proceed from album lookup to upload after sign-out", async () => {
  let active = true;
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>(resolve => {started = resolve;});
  const held = new Promise<void>(resolve => {release = resolve;});
  const photos = {uploadImageToAlbum: vi.fn()};
  const drive = {loadJotImageAlbum: async () => {started(); await held; return {version: 1 as const, albumId: "album", title: "jot", createdAt: "2030-01-01"};}};
  const flow = new ImageAttachmentFlow(photos as unknown as GooglePhotosAttachmentProvider, drive as never, {captureSession: () => () => active});
  const pending = flow.importLocalImage({source: {kind: "device-upload", bytes: new Blob(["image"], {type: "image/png"}), mimeType: "image/png"}, selectedResolution: resolveImageAttachmentResolution("original"), altText: "local"});
  await ready; active = false; release();
  await expect(pending).rejects.toMatchObject({name: "GoogleAuthCancelledError"});
  expect(photos.uploadImageToAlbum).not.toHaveBeenCalled();
});

it("a Photos byte upload cannot continue to batch-create with replacement credentials", async () => {
  let generation = 0;
  let release!: (response: Response) => void;
  const raw = new Promise<Response>(resolve => {release = resolve;});
  const requests: string[] = [];
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    requests.push(String(url));
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer A");
    return await raw;
  });
  const tokens = {getAccessToken: async () => generation === 0 ? "A" : "B", captureSession: () => {const own = generation; return () => own === generation;}};
  const photos = sessionScopedProvider(tokens, scoped => new GooglePhotosAttachmentProvider(scoped, fetchFn as typeof fetch));
  const pending = photos.uploadImageToAlbum({albumId: "A-album", filename: "image.jpg", mimeType: "image/jpeg", bytes: new Blob(["image"])});
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  generation++; release(new Response("old-upload-token"));
  await expect(pending).rejects.toMatchObject({name: "GoogleAuthCancelledError"});
  expect(requests).toEqual(["https://photoslibrary.googleapis.com/v1/uploads"]);
});

it.each(["photos", "drive"])("%s cannot start a request when its awaited token belongs to an ended session", async provider => {
  let active = true;
  let release!: (token: string) => void;
  const token = new Promise<string>(resolve => { release = resolve; });
  const tokens = {getAccessToken: () => token, captureSession: () => () => active};
  const fetchFn = vi.fn(async () => {throw new Error("request should not be sent");});
  const { GoogleDriveStorageProvider } = await import("~/storage/googleDriveStorage");
  const pending = provider === "photos"
    ? new GooglePhotosAttachmentProvider(tokens, fetchFn).getMediaItem("old-item")
    : new GoogleDriveStorageProvider(tokens, fetchFn).loadSettings();
  // Drive awaits the folder-resolution lock before it requests a token.
  await Promise.resolve(); await Promise.resolve();
  active = false; release("old-token");
  await pending.catch(() => undefined);
  expect(fetchFn).not.toHaveBeenCalled();
});

it.each(["photos", "drive"])("a delayed %s auth error body cannot invalidate a replacement session", async provider => {
  let active = true;
  let release!: (body: string) => void;
  const held = new Promise<string>(resolve => {release = resolve;});
  const tokens = {getAccessToken: async () => "old-token", captureSession: () => () => active, invalidateAccessToken: vi.fn()};
  const response = new Response("", {status: 401});
  response.text = vi.fn(() => held);
  const fetchFn = vi.fn(async () => response);
  const { GoogleDriveStorageProvider } = await import("~/storage/googleDriveStorage");
  const pending = provider === "photos"
    ? new GooglePhotosAttachmentProvider(tokens, fetchFn).getMediaItem("old-item")
    : new GoogleDriveStorageProvider(tokens, fetchFn).loadSettings();
  await vi.waitFor(() => expect(response.text).toHaveBeenCalled());
  active = false; release("invalid_token");
  await pending.catch(() => undefined);
  expect(tokens.invalidateAccessToken).not.toHaveBeenCalled();
});
