import { GoogleAccessTokenUnavailableError } from "./googleIdentity";
import { GoogleDriveRequestError } from "~/storage/googleDriveStorage";
import { GooglePhotosRequestError } from "~/photos/googlePhotosAttachments";

export function isAuthReconnectError(error: unknown): boolean {
  if (error instanceof GoogleAccessTokenUnavailableError) return true;
  if (error instanceof GoogleDriveRequestError || error instanceof GooglePhotosRequestError) {
    return isGoogleAuthFailure(error.status, error.responseBody);
  }
  return false;
}

function isGoogleAuthFailure(status: number, responseBody: string): boolean {
  return (
    status === 401 ||
    responseBody.includes("invalid_token") ||
    responseBody.includes("Invalid Credentials") ||
    responseBody.includes("Request is missing required authentication credential")
  );
}
