import { test, expect } from "@playwright/test";
import { createTemplate } from "../../src/core/templates";

test("sets a lap range and serves a driver's penalty and refuels through pit entry", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.locator("#browser-file").setInputFiles({
    name: "Langstrecke.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(createTemplate("endurance"), "latin1"),
  });
  await page.clock.pauseAt(new Date(Date.now() + 2000));
  await page.getByRole("button", { name: "Simulator BETA" }).click();
  await page.getByLabel("Rundenzeit von (s)").fill("2");
  await page.getByLabel("Rundenzeit bis (s)").fill("1");
  await page.getByRole("button", { name: "Zeitbereich übernehmen" }).click();
  await expect(page.locator(".race-settings")).toContainText("mindestens");
  await page.getByLabel("Rundenzeit bis (s)").fill("2.2");
  await page.getByRole("button", { name: "Zeitbereich übernehmen" }).click();
  await page.getByLabel("Boxenstrafe (s)").fill("3");
  await page.getByLabel("Tankverzögerung nach Strafe (s)").fill("2");
  const card = page.locator(".driver-card").first();
  await card.getByRole("button", { name: "Strafe vergeben" }).click();
  await card.getByRole("button", { name: "Strafe vergeben" }).click();
  await expect(card).toContainText("danach 3 s");
  await page.getByRole("button", { name: "Starten", exact: true }).click();
  await page.clock.runFor(1000);
  await expect(card).toContainText("100.0 %");
  await page.clock.runFor(1300);
  await expect(card).toContainText("98.0 %");
  await expect(card).toContainText("Boxenstrafe offen · 3.0 s");
  await card.getByRole("button", { name: /Boxeneinfahrt/ }).click();
  await page.clock.runFor(1800);
  await expect(card).toContainText("Absitzen · 1.2 s");
  await expect(card).toContainText("98.0 %");
  await card.getByRole("button", { name: /Box verlassen/ }).click();
  await expect(card).toContainText("Boxenstrafe offen · 3.0 s");
  await card.getByRole("button", { name: /Boxeneinfahrt/ }).click();
  await page.clock.runFor(7000);
  await expect(card).toContainText("Tanken in 1.0 s");
  await expect(card).toContainText("98.0 %");
  await expect(card.locator(".fuel-meter i")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await expect(card.locator(".fuel-meter i")).toHaveAttribute(
    "style",
    /width: 50%/,
  );
  const countdown = page.locator(
    '.artboard rect[fill="#c5cbd0"] + rect[fill="#000000"]',
  );
  await expect(countdown).toHaveCount(1);
  await page.clock.runFor(1400);
  await expect(countdown).toHaveCount(0);
  await expect(card).toContainText("Tank voll");
  await card.getByRole("button", { name: /Box verlassen/ }).click();
  await expect(
    card.getByRole("button", { name: /Boxeneinfahrt/ }),
  ).toBeVisible();
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
});
