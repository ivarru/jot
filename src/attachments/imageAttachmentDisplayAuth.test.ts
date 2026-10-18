import { ImageAttachmentFlow, type ImageAttachmentMetadataStore } from "./imageAttachmentFlow";
import { GooglePhotosAttachmentProvider, GooglePhotosRequestError } from "~/photos/googlePhotosAttachments";
import { GoogleDriveStorageProvider, GoogleDriveRequestError } from "~/storage/googleDriveStorage";
import { sessionScopedProvider } from "~/auth/sessionScopedProvider";
import type { ImageAttachmentMetadata } from "~/domain/imageAttachments";

const metadata: ImageAttachmentMetadata = {
  version: 1, id: "01HZY3J2CJX6N7Y25K2K3N8E4A", createdAt: "2030-01-01T00:00:00.000Z", selectedResolution: "original",
  source: {kind: "device-upload"}, copy: {kind: "google-photos-library", albumId: "album", mediaItemId: "image"}
};
const store = (): ImageAttachmentMetadataStore => ({
  loadImageAttachmentMetadata: async () => metadata, loadJotImageAlbum: async () => null,
  saveJotImageAlbum: async () => {}, saveImageAttachmentMetadata: async () => {}, findImageAttachmentMetadataByMediaItemId: async () => null
});
function tokens() {
  let generation = 0;
  return {
    getAccessToken: async () => "synthetic-token",
    captureSession: () => {const own = generation; return () => own === generation;},
    invalidateAccessToken: vi.fn(() => {generation++;})
  };
}

it.each(["photos", "drive"])("preserves a %s image auth failure after its own token invalidation", async provider => {
  const auth = tokens();
  const fetchFn = vi.fn(async () => new Response("invalid_token", {status: 401}));
  const photos = sessionScopedProvider(auth, scoped => new GooglePhotosAttachmentProvider(scoped, fetchFn));
  const drive = provider === "drive"
    ? sessionScopedProvider(auth, scoped => new GoogleDriveStorageProvider(scoped, fetchFn)) : store();
  const flow = new ImageAttachmentFlow(photos, drive, auth);
  await expect(flow.resolveImageAttachmentDisplay(metadata.id)).rejects.toBeInstanceOf(
    provider === "drive" ? GoogleDriveRequestError : GooglePhotosRequestError
  );
  expect(auth.invalidateAccessToken).toHaveBeenCalledTimes(1);
});

it.each(["photos", "drive"])("still discards a delayed %s error from a replaced credential session", async provider => {
  const auth = tokens();
  let release!: (body: string) => void;
  const held = new Promise<string>(resolve => {release = resolve;});
  const response = new Response("", {status: 401});
  response.text = vi.fn(() => held);
  const fetchFn = vi.fn(async () => response);
  const photos = sessionScopedProvider(auth, scoped => new GooglePhotosAttachmentProvider(scoped, fetchFn));
  const drive = provider === "drive"
    ? sessionScopedProvider(auth, scoped => new GoogleDriveStorageProvider(scoped, fetchFn)) : store();
  const pending = new ImageAttachmentFlow(photos, drive, auth).resolveImageAttachmentDisplay(metadata.id);
  await vi.waitFor(() => expect(response.text).toHaveBeenCalled());
  auth.invalidateAccessToken();
  release("invalid_token");
  await expect(pending).rejects.toMatchObject({name: "GoogleAuthCancelledError"});
  expect(auth.invalidateAccessToken).toHaveBeenCalledTimes(1);
});

it.each(["photos", "drive"])("keeps non-auth %s failures visible as image errors", async provider => {
  const auth = tokens();
  const fetchFn = vi.fn(async () => new Response("not found", {status: 404}));
  const photos = sessionScopedProvider(auth, scoped => new GooglePhotosAttachmentProvider(scoped, fetchFn));
  const drive = provider === "drive"
    ? sessionScopedProvider(auth, scoped => new GoogleDriveStorageProvider(scoped, fetchFn)) : store();
  await expect(new ImageAttachmentFlow(photos, drive, auth).resolveImageAttachmentDisplay(metadata.id)).resolves.toMatchObject({status: "error", message: expect.stringContaining("404")});
  expect(auth.invalidateAccessToken).not.toHaveBeenCalled();
});
