import { test, expect } from "@playwright/test";
import { createTemplate } from "../../src/core/templates";
import { openEditor } from "./helpers";
test("dashboard remembers thumbnails, reopens and removes a recent document", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("main", { name: "Startdashboard" }),
  ).toBeVisible();
  await expect(
    page.getByText("Hier stehen bald deine Rennbildschirme."),
  ).toBeVisible();
  for (const name of ["Clubrennen.xml", "Training.xml", "Race Control.xml"]) {
    await page.locator("#browser-file").setInputFiles({
      name,
      mimeType: "application/xml",
      buffer: Buffer.from(
        createTemplate("race").replace(
          "CLUB RACE",
          name.replace(".xml", "").toUpperCase(),
        ),
        "latin1",
      ),
    });
    await expect(page.locator(".workspace")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("rbs-studio-recents-v1") || "[]")[0]
              ?.thumbnail,
        ),
      )
      .toMatch(/^data:image\/webp/);
  }
  await page.getByTitle("Startseite", { exact: true }).click();
  await expect(page.locator(".recent-card img")).toHaveCount(3);
  await page.screenshot({
    path: "test-results/Startdashboard.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".start-dashboard")).toBeVisible();
  await page
    .getByRole("button", { name: "Clubrennen.xml öffnen", exact: true })
    .click();
  await expect(page.locator(".workspace")).toBeVisible();
  await expect(page.locator(".artboard")).toContainText("CLUBRENNEN");
  await page.getByTitle("Startseite", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Clubrennen.xml aus Verlauf entfernen",
      exact: true,
    })
    .click();
  await expect(page.locator(".recent-card")).toHaveCount(2);
  await page.getByRole("button", { name: /Zurück zu/ }).click();
  await expect(page.locator(".artboard")).toContainText("CLUBRENNEN");
});
test("new RBS starts from dashboard; returning home preserves unsaved work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Neuen RBS anlegen/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Leere Arbeitsfläche" })
    .click();
  await page.getByRole("button", { name: "Rennbildschirm erstellen" }).click();
  await expect(page.locator(".workspace")).toBeVisible();
  await page.getByRole("button", { name: "Elemente", exact: true }).click();
  await page
    .locator(".catalog-grid")
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page
    .getByLabel("Elementtext", { exact: true })
    .fill("Noch nicht gespeichert");
  await page.getByLabel("Elementtext", { exact: true }).blur();
  await page.getByTitle("Startseite", { exact: true }).click();
  await expect(
    page.getByText(/Ungespeicherte Änderungen bleiben erhalten/),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#browser-file").setInputFiles({
    name: "Other.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(createTemplate("race"), "latin1"),
  });
  await page.getByRole("button", { name: /Zurück zu/ }).click();
  await expect(page.locator(".artboard")).toContainText(
    "Noch nicht gespeichert",
  );
});
test("wheel zoom preserves the point under the cursor without changing XML", async ({
  page,
}) => {
  await openEditor(page);
  await page.getByTitle("Auf 100 % setzen").click();
  await page.getByTitle("Vergrößern", { exact: true }).click();
  const area = (await page.locator(".canvas-viewport").first().boundingBox())!;
  const before = (await page.locator(".artboard").first().boundingBox())!;
  const x = area.x + area.width / 2,
    y = area.y + area.height / 2;
  const worldX = (x - before.x) / before.width,
    worldY = (y - before.y) / before.height;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(
      async () =>
        (await page.locator(".artboard").first().boundingBox())!.width,
    )
    .toBeGreaterThan(before.width);
  const after = (await page.locator(".artboard").first().boundingBox())!;
  expect(Math.abs(after.x + worldX * after.width - x)).toBeLessThan(2);
  expect(Math.abs(after.y + worldY * after.height - y)).toBeLessThan(2);
  await page.mouse.wheel(0, 120);
  await expect
    .poll(
      async () =>
        (await page.locator(".artboard").first().boundingBox())!.width,
    )
    .toBeCloseTo(before.width, 0);
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
  const zoom = await page.getByTitle("Auf 100 % setzen").innerText();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await downloaded;
  await expect(page.getByTitle("Auf 100 % setzen")).toHaveText(zoom);
});

test("a missing recent Windows file reports an error and keeps the dashboard open", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "rbs-studio-recents-v1",
      JSON.stringify([
        {
          key: "file:c:/missing/rennen.xml",
          path: "C:/missing/Rennen.xml",
          native: true,
          width: 1920,
          height: 1080,
          openedAt: Date.now(),
          thumbnail: "",
        },
      ]),
    );
  });
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).isTauri = true;
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        if (
          command === "open_document" &&
          args.path === "C:/missing/Rennen.xml"
        )
          throw Error("Datei nicht gefunden");
        throw Error(`Unexpected IPC ${command}`);
      },
    };
  });
  await page
    .getByRole("button", { name: "Rennen.xml öffnen", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Datei nicht gefunden");
  await expect(page.locator(".start-dashboard")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Rennen.xml aus Verlauf entfernen",
      exact: true,
    })
    .click();
  await expect(page.locator(".recent-card")).toHaveCount(0);
});
test("first selected element stays highlighted and controls both alignments", async ({
  page,
}) => {
  await page.goto("/");
  const source =
    '<RennScreen><base><dim xmax="1920" ymax="1080"/></base><grafik><box left="20" top="30" breite="60" hoehe="60"/><box left="200" top="300" breite="70" hoehe="80"/><box left="400" top="500" breite="90" hoehe="100"/></grafik></RennScreen>';
  await page.locator("#browser-file").setInputFiles({
    name: "Alignment.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(source),
  });
  const layers = page.locator(".layer-row");
  await layers.nth(1).click();
  await layers.nth(0).click({ modifiers: ["Shift"] });
  await layers.nth(2).click({ modifiers: ["Shift"] });
  await expect(layers.nth(1)).toHaveClass(/anchor-layer/);
  await expect(page.locator(".selection-anchor")).toHaveCount(1);
  await page
    .getByTitle("Horizontal ausrichten · Y wie das erste markierte Element", {
      exact: true,
    })
    .click();
  await expect(page.locator(".rbs-element").nth(0)).toHaveAttribute(
    "transform",
    "translate(20,300)",
  );
  await expect(page.locator(".rbs-element").nth(2)).toHaveAttribute(
    "transform",
    "translate(400,300)",
  );
  await page
    .getByTitle("Vertikal ausrichten · X wie das erste markierte Element", {
      exact: true,
    })
    .click();
  await expect(page.locator(".rbs-element").nth(0)).toHaveAttribute(
    "transform",
    "translate(200,300)",
  );
  await expect(page.locator(".rbs-element").nth(2)).toHaveAttribute(
    "transform",
    "translate(200,300)",
  );
  await layers.nth(1).click({ modifiers: ["Shift"] });
  await expect(layers.nth(0)).toHaveClass(/anchor-layer/);
  await page.screenshot({
    path: "test-results/Ausrichten.png",
    fullPage: true,
  });
});
