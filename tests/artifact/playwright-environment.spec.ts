import { expect, test } from "@playwright/test";

test("Playwright workers do not receive conflicting color settings", () => {
  expect(process.env.NO_COLOR && process.env.FORCE_COLOR).toBeFalsy();
});
