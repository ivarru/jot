import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { DailyNoteUploadStatusAlert } from "./DailyNoteUploadStatusAlert";

describe("DailyNoteUploadStatusAlert", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("shows visible progress while Daily Notes are uploading", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const dispose = render(
      () => (
        <DailyNoteUploadStatusAlert
          inProgress={true}
          message={null}
          onDismissMessage={() => undefined}
        />
      ),
      host
    );

    expect(host.textContent).toContain("Uploading daily notes...");

    dispose();
  });

  it("lets the user dismiss a completed Daily Note upload message", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const [message, setMessage] = createSignal<string | null>("Uploaded 18 daily notes.");

    const dispose = render(
      () => (
        <DailyNoteUploadStatusAlert
          inProgress={false}
          message={message()}
          onDismissMessage={() => setMessage(null)}
        />
      ),
      host
    );

    expect(host.textContent).toContain("Uploaded 18 daily notes.");
    const dismiss = host.querySelector<HTMLButtonElement>("button[aria-label='Dismiss daily note upload message']");
    expect(dismiss).not.toBeNull();

    dismiss!.click();

    expect(host.textContent).not.toContain("Uploaded 18 daily notes.");

    dispose();
  });
});
