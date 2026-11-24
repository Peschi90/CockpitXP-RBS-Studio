import { expect, test } from "@playwright/test";
import { openEditor } from "./helpers";

test("driver wizard previews resizing, cancel leaves XML intact and apply is undoable", async ({
  page,
}) => {
  await openEditor(page);
  const toolbar = page.getByRole("button", {
    name: "Fahrerplätze",
    exact: true,
  });
  const wizard = page.getByRole("dialog", { name: "Fahrerplätze anpassen" });
  const xml = page.getByRole("button", { name: "XML", exact: true });
  await xml.click();
  const original = await page.getByLabel("XML-Quelltext").inputValue();
  await page.keyboard.press("Escape");

  await toolbar.click();
  await wizard.getByRole("button", { name: "Anordnung" }).click();
  await wizard.getByLabel("Fahrerzahl").selectOption("8");
  await wizard.getByLabel("Platzgrenzen anzeigen").check();
  await expect(wizard.locator(".wizard-overlay text")).toHaveCount(8);
  const secondCell = wizard.locator(".wizard-overlay rect").nth(1);
  const beforeGap = await secondCell.getAttribute("y");
  await wizard.getByLabel("Vertikaler Abstand (px)").fill("31");
  await expect(secondCell).not.toHaveAttribute("y", beforeGap!);
  await wizard.getByRole("button", { name: "Abbrechen" }).click();
  await xml.click();
  await expect(page.getByLabel("XML-Quelltext")).toHaveValue(original);
  await page.keyboard.press("Escape");

  await toolbar.click();
  await wizard.getByRole("button", { name: "Anordnung" }).click();
  await wizard.getByLabel("Fahrerzahl").selectOption("3");
  await wizard.getByLabel("Fläche").selectOption("screen");
  await wizard.getByLabel("Vertikaler Abstand (px)").fill("24");
  await wizard.getByRole("button", { name: "Übernehmen" }).click();
  await expect(wizard).toHaveCount(0);
  await xml.click();
  const changed = await page.getByLabel("XML-Quelltext").inputValue();
  expect(changed).toContain('slots="3"');
  expect(changed).not.toMatch(/nr="[4-6]"/);
  await page.keyboard.press("Escape");
  await page.getByTitle("Rückgängig · Strg Z").click();
  await xml.click();
  await expect(page.getByLabel("XML-Quelltext")).toHaveValue(original);
});
