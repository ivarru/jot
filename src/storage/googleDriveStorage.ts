import type { AccessTokenProvider } from "~/auth/accessTokenProvider";
import { dateToFilename, type IsoDate } from "~/domain/dates";
import { type JotSettings, normalizeJotSettings } from "~/domain/settings";
import type { RemoteDailyNote, RemoteStorageProvider, SaveDailyNoteInput, SaveDailyNoteResult } from "./types";

export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FILE_FIELDS = "id,name,mimeType,modifiedTime,version";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const MARKDOWN_MIME_TYPE = "text/markdown";
const JSON_MIME_TYPE = "application/json";
const JOT_FOLDER_NAME = "jot";
const DAILY_NOTES_FOLDER_NAME = "Daily Notes";
const SETTINGS_FILE_NAME = "settings.json";

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

  private async ensureFolders(): Promise<JotDriveFolders> {
    this.foldersPromise ??= this.loadOrCreateFolders();
    try {
      return await this.foldersPromise;
    } catch (error) {
      this.foldersPromise = null;
      throw error;
    }
  }

  private async loadOrCreateFolders(): Promise<JotDriveFolders> {
    const jotFolder = await this.findOrCreateFolder("root", JOT_FOLDER_NAME, "Jot Folder");
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

  private async listFiles(parentId: string, name: string, mimeType: string): Promise<DriveFile[]> {
    const query = [
      `${driveQueryStringLiteral(parentId)} in parents`,
      `name = ${driveQueryStringLiteral(name)}`,
      `mimeType = ${driveQueryStringLiteral(mimeType)}`,
      "trashed = false"
    ].join(" and ");

    const params = new URLSearchParams({
      spaces: "drive",
      pageSize: "10",
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

function driveQueryStringLiteral(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}
