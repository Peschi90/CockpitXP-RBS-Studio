import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createTemplate } from "../../src/core/templates";
function symbolDocument(symbol: string) {
  return createTemplate("blank").replace(
    "</variablen>",
    `${symbol}</variablen>`,
  );
}

test("symbol actions show original labels and save numeric event IDs", async ({
  page,
}) => {
  await page.goto("/");
  const source = symbolDocument(
    '<symbole_einaus left="136" top="100" breite="42" hoehe="30" nr="1" audioid_ein="34" audioid_aus="35" symbolname="RaceCards-Strafe.bmp" symboladdonname="OwnSymbol" custom="keep"/>',
  );
  await page.locator("#browser-file").setInputFiles({
    name: "Events.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(source),
  });
  await page.locator(".layer-row").first().click();
  const on = page.getByLabel("Symbol anzeigen", { exact: true });
  const off = page.getByLabel("Symbol ausschalten", { exact: true });
  await expect(on.locator("option:checked")).toHaveText(
    "Boxengasse Strafe wurde ausgesprochen",
  );
  await expect(off.locator("option:checked")).toHaveText(
    "Boxengasse Strafe ist beendet",
  );
  await on.selectOption({ label: "Überfahrt Tanken Einfahrt" });
  await off.selectOption({ label: "Überfahrt Tanken Ausfahrt" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  const download = await downloadPromise;
  const xml = fs.readFileSync((await download.path())!, "utf8");
  expect(xml).toContain('audioid_ein="32"');
  expect(xml).toContain('audioid_aus="33"');
  expect(xml).toContain('symboladdonname="OwnSymbol"');
  expect(xml).toContain('custom="keep"');
  expect(xml).not.toContain("Überfahrt Tanken");
  await page.screenshot({
    path: "test-results/symbol-events.png",
    fullPage: true,
  });
});

test("unknown symbol IDs survive opening and remain editable", async ({
  page,
}) => {
  await page.goto("/");
  const source = symbolDocument(
    '<symbole_einaus left="50" top="50" breite="42" hoehe="30" nr="1" audioid_ein="999" audioid_aus="0" symbolname=""/>',
  );
  await page.locator("#browser-file").setInputFiles({
    name: "Unknown.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(source),
  });
  await page.locator(".layer-row").first().click();
  const on = page.getByLabel("Symbol anzeigen", { exact: true });
  await expect(on.locator("option:checked")).toHaveText(
    "Unbekanntes Ereignis (ID 999)",
  );
  await expect(
    page
      .getByLabel("Symbol ausschalten", { exact: true })
      .locator("option:checked"),
  ).toHaveText("Kein Ereignis");
  await page.getByRole("button", { name: "XML", exact: true }).click();
  await expect(page.getByLabel("XML-Quelltext")).toHaveValue(
    source.replaceAll("\r\n", "\n"),
  );
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.locator(".symbol-event-select summary").first().click();
  const manual = page.getByLabel("Symbol anzeigen: Ereignis-ID", {
    exact: true,
  });
  await manual.fill("1001");
  await manual.blur();
  await expect(on).toHaveValue("1001");
  await expect(on.locator("option:checked")).toHaveText(
    "Unbekanntes Ereignis (ID 1001)",
  );
  await on.selectOption("34");
  await expect(on.locator("option:checked")).toHaveText(
    "Boxengasse Strafe wurde ausgesprochen",
  );
  await expect(manual).toHaveValue("34");
});
