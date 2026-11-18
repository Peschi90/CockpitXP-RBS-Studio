import { test, expect, type Page } from "@playwright/test";
import { createTemplate } from "../../src/core/templates";

async function nativeUpdates(
  page: Page,
  mode: "offline" | "current" | "offer" | "delayed",
) {
  await page.addInitScript((mode) => {
    const w = window as any;
    w.isTauri = true;
    w.updateCalls = [];
    w.updateSaveCancelled = false;
    w.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
      transformCallback: () => 1,
      invoke: async (command: string, args: any) => {
        w.updateCalls.push(command);
        switch (command) {
          case "check_for_update":
            if (mode === "offline") throw Error("No network");
            if (mode === "current") return null;
            if (mode === "delayed")
              await new Promise((resolve) => (w.showUpdate = resolve));
            return { version: "0.8.0", currentVersion: "0.7.2", size: 4000000 };
          case "system_palette":
            return [];
          case "plugin:event|listen":
            return 1;
          case "plugin:event|unlisten":
            return;
          case "measure_rbs_text":
            throw Error("Browser metrics");
          case "choose_save_path":
            return w.updateSaveCancelled ? null : "C:/Rennen.xml";
          case "save_document":
            if (w.updateSaveCancelled) throw Error("Speichern abgebrochen");
            return {
              path: "C:/Rennen.xml",
              hash: "saved",
              encoding: "latin1",
              backup: null,
            };
          case "install_update":
            args.progress.onmessage({ downloaded: 2000000, total: 4000000 });
            return new Promise((resolve, reject) => {
              w.failUpdate = () => reject("Download unterbrochen");
              w.finishUpdate = resolve;
            });
          default:
            throw Error(`Unexpected IPC ${command}`);
        }
      },
    };
  }, mode);
}

for (const mode of ["offline", "current"] as const) {
  test(`startup stays silent when ${mode}`, async ({ page }) => {
    await nativeUpdates(page, mode);
    await page.goto("/");
    await expect(page.locator(".start-dashboard")).toBeVisible();
    expect(await page.evaluate(() => (window as any).updateCalls)).toContain(
      "check_for_update",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("asks before downloading, can defer, and checks again on next start", async ({
  page,
}) => {
  await nativeUpdates(page, "offer");
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Update verfügbar" });
  await expect(dialog).toContainText("0.8.0");
  await page.screenshot({ path: "test-results/Update.png" });
  expect(await page.evaluate(() => (window as any).updateCalls)).not.toContain(
    "install_update",
  );
  await dialog.getByRole("button", { name: "Später" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Jetzt aktualisieren" }).click();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute(
    "value",
    "2000000",
  );
  await expect(dialog).toContainText("50 %");
  await expect(dialog.getByRole("button", { name: "Später" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as any).failUpdate());
  await expect(dialog.getByRole("alert")).toContainText(
    "Download unterbrochen",
  );
  await dialog.getByRole("button", { name: "Jetzt aktualisieren" }).click();
  expect(
    (await page.evaluate(() => (window as any).updateCalls)).filter(
      (c: string) => c === "install_update",
    ),
  ).toHaveLength(2);
  await page.evaluate(() => (window as any).finishUpdate());
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("requires a successful save before installing over an edited document", async ({
  page,
}) => {
  await nativeUpdates(page, "delayed");
  await page.goto("/");
  await page.locator("#browser-file").setInputFiles({
    name: "Rennen.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(createTemplate("race"), "latin1"),
  });
  await page.getByRole("button", { name: "Elemente", exact: true }).click();
  await page
    .locator(".catalog-grid")
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page.evaluate(() => {
    (window as any).updateSaveCancelled = true;
    (window as any).showUpdate();
  });
  const dialog = page.getByRole("dialog", { name: "Update verfügbar" });
  await dialog
    .getByRole("button", { name: "Speichern und aktualisieren" })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("nicht gespeichert");
  expect(await page.evaluate(() => (window as any).updateCalls)).not.toContain(
    "install_update",
  );
  await page.evaluate(() => ((window as any).updateSaveCancelled = false));
  await dialog
    .getByRole("button", { name: "Speichern und aktualisieren" })
    .click();
  await expect(dialog.getByRole("progressbar")).toHaveAttribute(
    "value",
    "2000000",
  );
  const calls = await page.evaluate(
    () => (window as any).updateCalls as string[],
  );
  expect(calls.indexOf("save_document")).toBeLessThan(
    calls.indexOf("install_update"),
  );
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
});
