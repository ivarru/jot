export type ImageAttachmentDisplay =
  | {
      readonly id: string;
      readonly status: "loading";
    }
  | {
      readonly id: string;
      readonly status: "ready";
      readonly url: string;
      readonly expiresAtMs?: number;
    }
  | {
      readonly id: string;
      readonly status: "missing" | "error";
      readonly message: string;
    };
