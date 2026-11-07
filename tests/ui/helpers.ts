import type { Page } from "@playwright/test";
import { createTemplate } from "../../src/core/templates";
export async function openEditor(page: Page) {
  await page.goto("/");
  await page
    .locator("#browser-file")
    .setInputFiles({
      name: "Demo.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(createTemplate("race"), "latin1"),
    });
}
