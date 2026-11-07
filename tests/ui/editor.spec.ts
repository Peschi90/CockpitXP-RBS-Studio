import { openEditor } from "./helpers";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createTemplate } from "../../src/core/templates";
test("edit, undo, duplicate, validate XML and export a template", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openEditor(page);
  await expect(page.getByText("COCKPIT-XP EDITOR")).toBeVisible();
  await page.getByRole("button", { name: "Elemente", exact: true }).click();
  await page
    .locator(".catalog-grid")
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page.getByLabel("Elementtext", { exact: true }).fill("Mein Clubrennen");
  await page.getByLabel("Elementtext", { exact: true }).blur();
  await expect(page.locator(".artboard")).toContainText("Mein Clubrennen");
  await page.getByLabel("Position X", { exact: true }).fill("222");
  await page.getByLabel("Position X", { exact: true }).blur();
  await page.getByTitle("Rückgängig · Strg Z").click();
  await expect(page.getByLabel("Bildschirmbreite")).toBeVisible();
  await page.getByTitle("Wiederholen · Strg Y").click();
  await page.getByRole("button", { name: "Ebenen", exact: true }).click();
  await page
    .locator(".layer-row")
    .filter({ hasText: "Mein Clubrennen" })
    .click();
  await expect(page.getByLabel("Position X", { exact: true })).toHaveValue(
    "222",
  );
  await page.getByRole("button", { name: "Duplizieren", exact: true }).click();
  await expect(
    page.locator(".artboard text").filter({ hasText: "Mein Clubrennen" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "XML", exact: true }).click();
  const xml = page.getByLabel("XML-Quelltext");
  const original = await xml.inputValue();
  await xml.fill("<RennScreen>broken");
  await page.getByRole("button", { name: "Prüfen & übernehmen" }).click();
  await expect(page.locator(".inline-error")).toBeVisible();
  await xml.fill(original);
  await page.getByRole("button", { name: "Prüfen & übernehmen" }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("Rennen.xml");
  const filepath = await download.path();
  expect(fs.readFileSync(filepath!, "utf8")).toContain("Mein Clubrennen");
  await page.screenshot({ path: "test-results/editor.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("legacy import preserves unknown XML and simulation does not dirty it", async ({
  page,
}) => {
  await openEditor(page);
  const source = createTemplate("blank").replace(
    "<texte>",
    '<texte><!-- behalten --><text xpos="20" ypos="30" fh="30" fc="00FFFFFF" text="Grüße" fremd="bleibt"/>',
  );
  await page.locator("#browser-file").setInputFiles({
    name: "Rennen.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(source, "latin1"),
  });
  await expect(page.locator(".artboard")).toContainText("Grüße");
  await page.getByRole("button", { name: "Simulator BETA" }).click();
  await page.getByRole("button", { name: "Starten", exact: true }).click();
  await expect(page.locator(".sim-clock")).not.toHaveText("00:00", {
    timeout: 3000,
  });
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
  await page.getByRole("button", { name: "XML", exact: true }).click();
  expect(await page.getByLabel("XML-Quelltext").inputValue()).toBe(
    source.replaceAll("\r\n", "\n"),
  );
  await page.getByRole("button", { name: "Prüfen & übernehmen" }).click();
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
});
test("new screen, drag, resize and driver-row copying", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("button", { name: "Leere Arbeitsfläche" }).click();
  await page.getByRole("button", { name: "Rennbildschirm erstellen" }).click();
  await page.getByRole("button", { name: "Elemente", exact: true }).click();
  await page
    .locator(".catalog-grid")
    .getByRole("button", { name: "Fläche", exact: true })
    .click();
  const element = page.locator(".rbs-element").first(),
    b = await element.boundingBox();
  await page.mouse.move(b!.x + 20, b!.y + 15);
  await page.mouse.down();
  await page.mouse.move(b!.x + 60, b!.y + 35, { steps: 5 });
  await page.mouse.up();
  expect(
    Number(await page.getByLabel("Position X", { exact: true }).inputValue()),
  ).toBeGreaterThan(192);
  await page.getByLabel("Breite", { exact: true }).fill("500");
  await page.getByLabel("Breite", { exact: true }).blur();
  await expect(page.getByLabel("Breite", { exact: true })).toHaveValue("500");
  await page
    .getByRole("button", { name: "Für weitere Spur kopieren…" })
    .click();
  await page.getByRole("button", { name: "Kopieren", exact: true }).click();
  await expect(page.locator(".rbs-element")).toHaveCount(2);
});

test("simulator fits the workspace and renders editable live data", async ({
  page,
}) => {
  await openEditor(page);
  await page
    .locator(".layer-row")
    .filter({ hasText: "Fahrername" })
    .filter({ hasText: "Spur 1" })
    .click();
  await page.getByRole("button", { name: "Simulator BETA" }).click();
  await page.getByLabel("Simulationsgeschwindigkeit").selectOption("10");
  await page.getByRole("button", { name: "Starten", exact: true }).click();
  await expect(page.locator(".sim-clock")).toHaveText(/00:[1-9][0-9]/, {
    timeout: 5000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const board = await page.locator(".artboard").boundingBox(),
    viewport = await page.locator(".canvas-viewport").boundingBox();
  expect(board!.height).toBeLessThan(viewport!.height);
  expect(board!.y).toBeGreaterThanOrEqual(viewport!.y);
  await page.screenshot({ path: "test-results/Vorschau.png", fullPage: true });
});

test("table duplication includes its columns and simulation exports observed laps", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("button", { name: "Leere Arbeitsfläche" }).click();
  await page.getByRole("button", { name: "Rennbildschirm erstellen" }).click();
  await page.getByRole("button", { name: "Elemente", exact: true }).click();
  await page
    .locator(".catalog-grid")
    .getByRole("button", { name: "Runden-Tabelle", exact: true })
    .click();
  await expect(page.locator(".artboard table th")).toHaveCount(3);
  await page.getByRole("button", { name: "Duplizieren", exact: true }).click();
  await expect(page.locator(".artboard table th")).toHaveCount(6);
  await page.getByRole("button", { name: "XML", exact: true }).click();
  const before = await page.getByLabel("XML-Quelltext").inputValue();
  expect(before.match(/variable="runde"/g) || []).toHaveLength(2);
  await page.getByRole("button", { name: "Prüfen & übernehmen" }).click();
  await page.getByRole("button", { name: "Simulator BETA" }).click();
  await page.getByLabel("Simulationsgeschwindigkeit").selectOption("10");
  await page.getByRole("button", { name: "Starten", exact: true }).click();
  await expect(page.locator(".artboard tbody tr").first()).toBeVisible({
    timeout: 5000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Vorschau", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV exportieren" }).last().click();
  const file = await downloaded;
  expect(fs.readFileSync((await file.path())!, "utf8")).toContain(
    '"Runde";"Rundenzeit";"Tank"',
  );
  await page.getByRole("button", { name: "XML", exact: true }).click();
  expect(await page.getByLabel("XML-Quelltext").inputValue()).toBe(before);
});

test("extended simulator controls leave the document unchanged", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole("button", { name: "Simulator BETA" }).click();
  const panel = page.locator(".runtime-panel");
  await panel.locator("summary").first().click();
  await panel.getByRole("combobox", { name: /^Spur/ }).selectOption("2");
  await panel.getByLabel("Ereignis-ID").fill("28");
  await panel.getByRole("button", { name: "Ereignis auslösen" }).click();
  await panel.getByRole("button", { name: "30 s Strafe" }).click();
  await panel.getByLabel("Rennzeit (s)").fill("900");
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
  await panel.screenshot({ path: "test-results/Simulator.png" });
  await panel.getByRole("button", { name: "Cockpit-Datenbank lesen" }).click();
  await expect(panel.getByRole("alert")).toContainText("Windows-App");
});

test("separate slot text colors and AddOn events render without changing the RBS", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openEditor(page);
  const source = createTemplate("blank")
    .replace(
      "<grafik>",
      '<grafik><box left="40" top="50" breite="800" hoehe="150" nr="1" c="slotcolorbg"/>',
    )
    .replace(
      "<variablen>",
      '<variablen><fahrer nr="1" left="60" top="70" fh="40" fc="slotcolor"/><addonVariable nr="0" left="60" top="250" fh="32" fc="00FFFFFF" addonvariablename="DemoStatus">Status</addonVariable><progressbar nr="1" typ="AddonBar" left="60" top="310" breite="400" hoehe="30" addonvariablename="DemoTank"/>',
    );
  await page.locator("#browser-file").setInputFiles({
    name: "Rennen.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(source, "latin1"),
  });
  await page.getByRole("button", { name: "Simulator BETA" }).click();
  const panel = page.locator(".runtime-panel");
  await panel.locator("summary").first().click();
  await panel
    .getByLabel("Slot-Hintergrundfarbe", { exact: true })
    .fill("#113355");
  await panel.getByLabel("Slot-Textfarbe", { exact: true }).fill("#fdfdfd");
  await expect(
    page.locator(".artboard text").filter({ hasText: "Max Weber" }),
  ).toHaveAttribute("fill", "#fdfdfd");
  await expect(page.locator('.artboard rect[fill="#113355"]')).toHaveCount(1);
  await page.locator(".addon-panel > summary").click();
  await page
    .getByRole("button", { name: "Demo-AddOn laden", exact: true })
    .click();
  await page
    .getByRole("button", { name: "AddOn starten", exact: true })
    .click();
  await expect(page.locator(".artboard").first()).toContainText("Pause");
  await expect(page.locator(".artboard foreignObject .artboard")).toHaveCount(
    1,
  );
  await expect(page.locator(".artboard foreignObject .artboard")).toContainText(
    "ADDON · SIMULATION",
  );
  await page.getByRole("button", { name: "Starten", exact: true }).click();
  await page.getByLabel("Simulationsgeschwindigkeit").selectOption("10");
  await expect(page.locator(".artboard").first()).toContainText("Runde 1", {
    timeout: 5000,
  });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
  await page.getByRole("button", { name: "XML", exact: true }).click();
  expect(await page.getByLabel("XML-Quelltext").inputValue()).toBe(
    source.replaceAll("\r\n", "\n"),
  );
  await page.getByRole("button", { name: "Prüfen & übernehmen" }).click();
  await page.screenshot({
    path: "test-results/AddOn-Vorschau.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "AddOn stoppen", exact: true })
    .click();
  await expect(page.locator(".artboard")).toContainText("Status");
  expect(errors).toEqual([]);
});
