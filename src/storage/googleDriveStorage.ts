import type { AccessTokenProvider } from "~/auth/accessTokenProvider";
import { dateToFilename, type IsoDate } from "~/domain/dates";
import {
  imageAttachmentMetadataFilename,
  type ImageAttachmentMetadata,
  type JotImageAlbumMetadata
} from "~/domain/imageAttachments";
import { type JotSettings, normalizeJotSettings } from "~/domain/settings";
import type { RemoteDailyNote, RemoteStorageProvider, SaveDailyNoteInput, SaveDailyNoteResult } from "./types";
import jotDriveAgentsTemplate from "./jot-drive-agents-template.md?raw";

export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FILE_FIELDS = "id,name,mimeType,modifiedTime,version";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const MARKDOWN_MIME_TYPE = "text/markdown";
const JSON_MIME_TYPE = "application/json";
const JOT_FOLDER_NAME = "jot";
const DAILY_NOTES_FOLDER_NAME = "Daily Notes";
const IMAGE_ATTACHMENTS_FOLDER_NAME = "Image Attachments";
const SETTINGS_FILE_NAME = "settings.json";
const IMAGE_ALBUM_FILE_NAME = "image-album.json";
const AGENTS_FILE_NAME = "AGENTS.md";
const AGENTS_CONTENT = jotDriveAgentsTemplate;
const AGENTS_TEMPLATE_MODIFIED_AT = readTemplateModifiedAt(AGENTS_CONTENT);

type FetchLike = typeof fetch;

interface DriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly modifiedTime?: string;
  readonly version?: string;
}

interface DriveListResponse {
  readonly files?: DriveFile[];
}

interface JotDriveFolders {
  readonly jotFolderId: string;
  readonly dailyNotesFolderId: string;
}

export class DuplicateDriveFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateDriveFileError";
  }
}

export class GoogleDriveRequestError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: string
  ) {
    super(`Google Drive request failed with HTTP ${status}: ${responseBody}`);
    this.name = "GoogleDriveRequestError";
  }
}

export class GoogleDriveStorageProvider implements RemoteStorageProvider {
  private foldersPromise: Promise<JotDriveFolders> | null = null;

  constructor(
    private readonly tokenProvider: AccessTokenProvider,
    private readonly fetchFn: FetchLike = globalThis.fetch.bind(globalThis)
  ) {}

  async loadDailyNote(date: IsoDate): Promise<RemoteDailyNote | null> {
    const { dailyNotesFolderId } = await this.ensureFolders();
    const file = await this.findSingleFile({
      parentId: dailyNotesFolderId,
      name: dateToFilename(date),
      mimeType: MARKDOWN_MIME_TYPE,
      description: `Daily Note ${date}`
    });

    if (file === null) return null;

    const markdown = await this.downloadText(file.id);
    return driveFileToDailyNote(date, file, markdown);
  }

  async saveDailyNote(input: SaveDailyNoteInput): Promise<SaveDailyNoteResult> {
    const { dailyNotesFolderId } = await this.ensureFolders();
    const name = dateToFilename(input.date);
    const existing = await this.findSingleFile({
      parentId: dailyNotesFolderId,
      name,
      mimeType: MARKDOWN_MIME_TYPE,
      description: `Daily Note ${input.date}`
    });

    if (existing !== null && driveRevisionId(existing) !== input.expectedRevisionId) {
      const remoteMarkdown = await this.downloadText(existing.id);
      return {
        type: "conflict",
        remote: driveFileToDailyNote(input.date, existing, remoteMarkdown)
      };
    }

    const saved =
      existing === null
        ? await this.createMultipartFile({
            metadata: {
              name,
              mimeType: MARKDOWN_MIME_TYPE,
              parents: [dailyNotesFolderId],
              appProperties: {
                jotType: "daily-note",
                date: input.date
              }
            },
            content: input.markdown,
            contentType: MARKDOWN_MIME_TYPE
          })
        : await this.updateMediaFile(existing.id, input.markdown, MARKDOWN_MIME_TYPE);

    return {
      type: "saved",
      note: driveFileToDailyNote(input.date, saved, input.markdown)
    };
  }

  async loadSettings(): Promise<JotSettings | null> {
    const { jotFolderId } = await this.ensureFolders();
    const file = await this.findSingleFile({
      parentId: jotFolderId,
      name: SETTINGS_FILE_NAME,
      mimeType: JSON_MIME_TYPE,
      description: "Jot Settings"
    });

    if (file === null) return null;

    const settingsText = await this.downloadText(file.id);
    return normalizeJotSettings(JSON.parse(settingsText));
  }

  async saveSettings(settings: JotSettings): Promise<JotSettings> {
    const normalized = normalizeJotSettings(settings);
    const { jotFolderId } = await this.ensureFolders();
    const existing = await this.findSingleFile({
      parentId: jotFolderId,
      name: SETTINGS_FILE_NAME,
      mimeType: JSON_MIME_TYPE,
      description: "Jot Settings"
    });
    const content = JSON.stringify(normalized, null, 2);

    if (existing === null) {
      await this.createMultipartFile({
        metadata: {
          name: SETTINGS_FILE_NAME,
          mimeType: JSON_MIME_TYPE,
          parents: [jotFolderId],
          appProperties: {
            jotType: "settings"
          }
        },
        content,
        contentType: JSON_MIME_TYPE
      });
    } else {
      await this.updateMediaFile(existing.id, content, JSON_MIME_TYPE);
    }

    return normalized;
  }

  async loadJotImageAlbum(): Promise<JotImageAlbumMetadata | null> {
    const { jotFolderId } = await this.ensureFolders();
    const file = await this.findSingleFile({
      parentId: jotFolderId,
      name: IMAGE_ALBUM_FILE_NAME,
      mimeType: JSON_MIME_TYPE,
      description: "Jot Image Album Metadata"
    });

    if (file === null) return null;
    return JSON.parse(await this.downloadText(file.id)) as JotImageAlbumMetadata;
  }

  async saveJotImageAlbum(metadata: JotImageAlbumMetadata): Promise<void> {
    const { jotFolderId } = await this.ensureFolders();
    await this.saveJsonFile({
      parentId: jotFolderId,
      name: IMAGE_ALBUM_FILE_NAME,
      description: "Jot Image Album Metadata",
      appProperties: {
        jotType: "image-album"
      },
      value: metadata
    });
  }

  async loadImageAttachmentMetadata(id: string): Promise<ImageAttachmentMetadata | null> {
    const imageAttachmentsFolderId = await this.ensureImageAttachmentsFolder();
    const file = await this.findSingleFile({
      parentId: imageAttachmentsFolderId,
      name: imageAttachmentMetadataFilename(id),
      mimeType: JSON_MIME_TYPE,
      description: `Image Attachment ${id}`
    });

    if (file === null) return null;
    return JSON.parse(await this.downloadText(file.id)) as ImageAttachmentMetadata;
  }

  async findImageAttachmentMetadataByCopiedMediaItemId(mediaItemId: string): Promise<ImageAttachmentMetadata | null> {
    return await this.findImageAttachmentMetadataByAppProperty("copyMediaItemId", mediaItemId);
  }

  async findImageAttachmentMetadataByMediaItemId(mediaItemId: string): Promise<ImageAttachmentMetadata | null> {
    return (
      await this.findImageAttachmentMetadataByAppProperty("sourceMediaItemId", mediaItemId) ??
      await this.findImageAttachmentMetadataByAppProperty("copyMediaItemId", mediaItemId)
    );
  }

  async listImageAttachmentMetadata(): Promise<ImageAttachmentMetadata[]> {
    const imageAttachmentsFolderId = await this.ensureImageAttachmentsFolder();
    const files = await this.listFilesByQuery({
      parentId: imageAttachmentsFolderId,
      mimeType: JSON_MIME_TYPE
    });
    const metadata = await Promise.all(
      files.map(async (file) => JSON.parse(await this.downloadText(file.id)) as ImageAttachmentMetadata)
    );

    return metadata;
  }

  async saveImageAttachmentMetadata(metadata: ImageAttachmentMetadata): Promise<void> {
    const imageAttachmentsFolderId = await this.ensureImageAttachmentsFolder();
    await this.saveJsonFile({
      parentId: imageAttachmentsFolderId,
      name: imageAttachmentMetadataFilename(metadata.id),
      description: `Image Attachment ${metadata.id}`,
      appProperties: {
        jotType: "image-attachment",
        imageAttachmentId: metadata.id,
        ...driveAppProperties({
          sourceMediaItemId: metadata.source.kind === "google-photos-picker" ? metadata.source.mediaItemId : undefined,
          copyMediaItemId: metadata.copy.mediaItemId
        })
      },
      value: metadata
    });
  }

  private async findImageAttachmentMetadataByAppProperty(
    key: string,
    value: string
  ): Promise<ImageAttachmentMetadata | null> {
    const imageAttachmentsFolderId = await this.ensureImageAttachmentsFolder();
    const file = await this.findSingleFileByQuery({
      parentId: imageAttachmentsFolderId,
      mimeType: JSON_MIME_TYPE,
      appProperty: { key, value },
      description: `Image Attachment metadata with ${key}`
    });

    if (file === null) return null;
    return JSON.parse(await this.downloadText(file.id)) as ImageAttachmentMetadata;
  }

  private async ensureFolders(): Promise<JotDriveFolders> {
    this.foldersPromise ??= this.loadOrCreateFolders();
    try {
      return await this.foldersPromise;
    } catch (error) {
      this.foldersPromise = null;
      throw error;
    }
  }

  private async ensureImageAttachmentsFolder(): Promise<string> {
    const { jotFolderId } = await this.ensureFolders();
    const folder = await this.findOrCreateFolder(
      jotFolderId,
      IMAGE_ATTACHMENTS_FOLDER_NAME,
      "Image Attachments Folder"
    );
    return folder.id;
  }

  private async loadOrCreateFolders(): Promise<JotDriveFolders> {
    const jotFolder = await this.findOrCreateFolder("root", JOT_FOLDER_NAME, "Jot Folder");
    await this.ensureAgentsFile(jotFolder.id);
    const dailyNotesFolder = await this.findOrCreateFolder(
      jotFolder.id,
      DAILY_NOTES_FOLDER_NAME,
      "Daily Notes Folder"
    );

    return {
      jotFolderId: jotFolder.id,
      dailyNotesFolderId: dailyNotesFolder.id
    };
  }

  private async ensureAgentsFile(jotFolderId: string): Promise<void> {
    const existing = await this.findSingleFile({
      parentId: jotFolderId,
      name: AGENTS_FILE_NAME,
      mimeType: MARKDOWN_MIME_TYPE,
      description: "Jot Drive AGENTS"
    });

    if (existing !== null) {
      if (isDriveFileOlderThan(existing, AGENTS_TEMPLATE_MODIFIED_AT)) {
        await this.updateMediaFile(existing.id, AGENTS_CONTENT, MARKDOWN_MIME_TYPE);
      }
      return;
    }

    await this.createMultipartFile({
      metadata: {
        name: AGENTS_FILE_NAME,
        mimeType: MARKDOWN_MIME_TYPE,
        parents: [jotFolderId],
        appProperties: {
          jotType: "agents",
          templateModifiedAt: AGENTS_TEMPLATE_MODIFIED_AT
        }
      },
      content: AGENTS_CONTENT,
      contentType: MARKDOWN_MIME_TYPE
    });
  }

  private async findOrCreateFolder(parentId: string, name: string, description: string): Promise<DriveFile> {
    const existing = await this.findSingleFile({
      parentId,
      name,
      mimeType: FOLDER_MIME_TYPE,
      description
    });

    if (existing !== null) return existing;

    return await this.requestJson<DriveFile>(`${DRIVE_API_BASE}/files?${new URLSearchParams({ fields: FILE_FIELDS })}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME_TYPE,
        parents: parentId === "root" ? undefined : [parentId],
        appProperties: {
          jotType: description
        }
      })
    });
  }

  private async saveJsonFile(input: {
    readonly parentId: string;
    readonly name: string;
    readonly description: string;
    readonly appProperties: Record<string, string>;
    readonly value: unknown;
  }): Promise<void> {
    const existing = await this.findSingleFile({
      parentId: input.parentId,
      name: input.name,
      mimeType: JSON_MIME_TYPE,
      description: input.description
    });
    const content = JSON.stringify(input.value, null, 2);

    if (existing === null) {
      await this.createMultipartFile({
        metadata: {
          name: input.name,
          mimeType: JSON_MIME_TYPE,
          parents: [input.parentId],
          appProperties: input.appProperties
        },
        content,
        contentType: JSON_MIME_TYPE
      });
    } else {
      await this.updateMediaFile(existing.id, content, JSON_MIME_TYPE);
    }
  }

  private async findSingleFile(input: {
    readonly parentId: string;
    readonly name: string;
    readonly mimeType: string;
    readonly description: string;
  }): Promise<DriveFile | null> {
    const files = await this.listFiles(input.parentId, input.name, input.mimeType);

    if (files.length > 1) {
      throw new DuplicateDriveFileError(`Found multiple Google Drive files for ${input.description}.`);
    }

    return files[0] ?? null;
  }

  private async findSingleFileByQuery(input: {
    readonly parentId: string;
    readonly mimeType: string;
    readonly appProperty: {
      readonly key: string;
      readonly value: string;
    };
    readonly description: string;
  }): Promise<DriveFile | null> {
    const files = await this.listFilesByQuery(input);

    if (files.length > 1) {
      throw new DuplicateDriveFileError(`Found multiple Google Drive files for ${input.description}.`);
    }

    return files[0] ?? null;
  }

  private async listFiles(parentId: string, name: string, mimeType: string): Promise<DriveFile[]> {
    return await this.listFilesByQuery({ parentId, name, mimeType });
  }

  private async listFilesByQuery(input: {
    readonly parentId: string;
    readonly name?: string;
    readonly mimeType: string;
    readonly appProperty?: {
      readonly key: string;
      readonly value: string;
    };
  }): Promise<DriveFile[]> {
    const query = [
      `${driveQueryStringLiteral(input.parentId)} in parents`,
      input.name === undefined ? null : `name = ${driveQueryStringLiteral(input.name)}`,
      `mimeType = ${driveQueryStringLiteral(input.mimeType)}`,
      input.appProperty === undefined ? null : driveAppPropertyQuery(input.appProperty.key, input.appProperty.value),
      "trashed = false"
    ].filter((part) => part !== null).join(" and ");

    const params = new URLSearchParams({
      spaces: "drive",
      pageSize: input.name === undefined ? "100" : "10",
      fields: `files(${FILE_FIELDS})`,
      q: query
    });

    const response = await this.requestJson<DriveListResponse>(`${DRIVE_API_BASE}/files?${params}`);
    return response.files ?? [];
  }

  private async downloadText(fileId: string): Promise<string> {
    const response = await this.request(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`);
    return await response.text();
  }

  private async createMultipartFile(input: {
    readonly metadata: Record<string, unknown>;
    readonly content: string;
    readonly contentType: string;
  }): Promise<DriveFile> {
    const params = new URLSearchParams({
      uploadType: "multipart",
      fields: FILE_FIELDS
    });
    const multipart = createMultipartRelatedBody(input.metadata, input.content, input.contentType);

    return await this.requestJson<DriveFile>(`${DRIVE_UPLOAD_BASE}/files?${params}`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${multipart.boundary}`
      },
      body: multipart.body
    });
  }

  private async updateMediaFile(fileId: string, content: string, contentType: string): Promise<DriveFile> {
    const params = new URLSearchParams({
      uploadType: "media",
      fields: FILE_FIELDS
    });

    return await this.requestJson<DriveFile>(`${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?${params}`, {
      method: "PATCH",
      headers: {
        "Content-Type": `${contentType}; charset=UTF-8`
      },
      body: content
    });
  }

  private async requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(url, init);
    return (await response.json()) as T;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.tokenProvider.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    const response = await this.fetchFn(url, {
      ...init,
      headers
    });

    if (!response.ok) {
      throw new GoogleDriveRequestError(response.status, await response.text());
    }

    return response;
  }
}

export function createMultipartRelatedBody(
  metadata: Record<string, unknown>,
  content: string,
  contentType: string
): { readonly boundary: string; readonly body: string } {
  const boundary = `jot-${crypto.randomUUID()}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    "",
    content,
    `--${boundary}--`,
    ""
  ].join("\r\n");

  return { boundary, body };
}

function driveFileToDailyNote(date: IsoDate, file: DriveFile, markdown: string): RemoteDailyNote {
  return {
    date,
    markdown,
    revisionId: driveRevisionId(file),
    updatedAt: file.modifiedTime ?? new Date().toISOString()
  };
}

function driveRevisionId(file: DriveFile): string {
  return file.version ?? file.modifiedTime ?? file.id;
}

function readTemplateModifiedAt(content: string): string {
  const match = content.match(/^Template modified: ([0-9:.TZ-]+)$/m);
  if (match?.[1] === undefined) {
    throw new Error("Drive AGENTS template is missing a Template modified timestamp.");
  }
  return match[1];
}

function isDriveFileOlderThan(file: DriveFile, isoDate: string): boolean {
  const fileModifiedAtMs = Date.parse(file.modifiedTime ?? "");
  const templateModifiedAtMs = Date.parse(isoDate);

  return (
    Number.isFinite(templateModifiedAtMs) &&
    (!Number.isFinite(fileModifiedAtMs) || fileModifiedAtMs < templateModifiedAtMs)
  );
}

function driveQueryStringLiteral(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function driveAppPropertyQuery(key: string, value: string): string {
  return `appProperties has { key=${driveQueryStringLiteral(key)} and value=${driveQueryStringLiteral(value)} }`;
}

function driveAppProperties(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
