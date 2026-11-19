import { test, expect, type Page } from "@playwright/test";
import { templates, filterTemplates } from "../../src/core/templates";
const source =
  '<RennScreen><base><dim xmax="800" ymax="600" slots="2"/></base><grafik><box left="70" top="110" breite="80" hoehe="40" c="00FFC874"/><box left="340" top="270" breite="110" hoehe="100" c="00BAE065"/></grafik></RennScreen>';
async function openFixture(page: Page) {
  await page.goto("/");
  await page.locator("#browser-file").setInputFiles({
    name: "Guides.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(source),
  });
  await page.getByTitle("Auf 100 % setzen").click();
}
async function drag(page: Page, dx: number, dy: number) {
  const r = await page.locator(".workspace .rbs-element").first().boundingBox();
  await page.mouse.move(r!.x + 20, r!.y + 15);
  await page.mouse.down();
  await page.mouse.move(r!.x + 20 + dx, r!.y + 15 + dy, { steps: 5 });
}
test("smart guides snap before grid, release commits one undo; Alt and switch disable snapping", async ({
  page,
}) => {
  await openFixture(page);
  const shape = page.locator(".workspace .rbs-element").first();
  await drag(page, 266, 156);
  await expect(page.locator(".smart-guides line")).toHaveCount(2);
  await expect(shape).toHaveAttribute("transform", "translate(340,270)");
  await page.screenshot({
    path: "test-results/Hilfslinien.png",
    fullPage: true,
  });
  await page.mouse.up();
  await expect(page.locator(".smart-guides")).toHaveCount(0);
  await expect(page.getByLabel("Position X", { exact: true })).toHaveValue(
    "340",
  );
  await page.getByTitle("Rückgängig · Strg Z").click();
  await expect(shape).toHaveAttribute("transform", "translate(70,110)");
  await page.keyboard.down("Alt");
  await drag(page, 266, 156);
  await expect(page.locator(".smart-guides")).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(shape).toHaveAttribute("transform", "translate(336,266)");
  await page.getByTitle("Rückgängig · Strg Z").click();
  await page
    .getByRole("button", { name: "Intelligente Hilfslinien", exact: true })
    .click();
  await page
    .getByTitle("An 8-Pixel-Raster ausrichten · Alt zum Übergehen")
    .click();
  await drag(page, 266, 156);
  await expect(page.locator(".smart-guides")).toHaveCount(0);
  await page.mouse.up();
  await expect(shape).toHaveAttribute("transform", "translate(336,266)");
  // The choice survives a restart; it does not belong to the RBS file.
  await page.reload();
  await page.getByRole("button", { name: /Guides.xml öffnen/ }).click();
  await expect(
    page.getByRole("button", { name: "Intelligente Hilfslinien", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
test("multi-selection moves rigidly and Escape cancels without editing XML", async ({
  page,
}) => {
  await openFixture(page);
  const shapes = page.locator(".workspace .rbs-element");
  await page.locator(".layer-row").nth(1).click();
  await page
    .locator(".layer-row")
    .nth(0)
    .click({ modifiers: ["Shift"] });
  // Group right edge 450 snaps to canvas centre 400: both elements move -50.
  await drag(page, -46, 0);
  await expect(page.locator(".smart-guides line[data-axis=x]")).toHaveCount(1);
  await expect(shapes.nth(0)).toHaveAttribute("transform", "translate(20,110)");
  await expect(shapes.nth(1)).toHaveAttribute(
    "transform",
    "translate(290,270)",
  );
  await page.mouse.up();
  await page.getByTitle("Rückgängig · Strg Z").click();
  await drag(page, 266, 156);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".smart-guides")).toHaveCount(0);
  await expect(shapes.first()).toHaveAttribute(
    "transform",
    "translate(70,110)",
  );
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
});
test("all live template previews create editable RBS layouts at their maximum driver count", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  await page.getByRole("button", { name: /Neuen RBS anlegen/ }).click();
  await expect(page.locator(".template-options > button")).toHaveCount(
    filterTemplates(6).length,
  );
  await expect(page.locator(".template-preview .artboard")).toHaveCount(
    filterTemplates(6).length - 1,
  );
  await page.screenshot({ path: "test-results/Vorlagen.png", fullPage: true });
  for (const t of templates.filter((t) => t.id !== "blank")) {
    await page
      .getByRole("dialog")
      .getByLabel("Fahreranzahl der Vorlage", { exact: true })
      .selectOption(String(t.maxDrivers));
    await page.locator(`[data-template="${t.id}"]`).click();
    await expect(page.locator(`[data-template="${t.id}"]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page
      .getByRole("button", { name: "Rennbildschirm erstellen" })
      .click();
    await expect(page.locator(".workspace")).toBeVisible();
    await expect(page.locator(".canvas-topline")).toContainText(
      `${t.maxDrivers} Fahrer`,
    );
    // Inspect text rendering, including field clipping, in the generated layout.
    const bounds = await page
      .locator(".workspace .rbs-element")
      .evaluateAll((elements) =>
        elements.flatMap((el) => {
          const text = el.querySelector("text");
          if (!text || !text.hasAttribute("clip-path")) return [];
          const clipId = text.getAttribute("clip-path")!.slice(5, -1);
          const rect = document.getElementById(clipId)?.querySelector("rect");
          if (!rect) return [];
          return [
            {
              text: text.textContent,
              width: text.getBBox().width,
              field: Number(rect.getAttribute("width")),
            },
          ];
        }),
      );
    expect(
      bounds.filter((b) => b.width > b.field + 1),
      `${t.name}: text must fit its field`,
    ).toEqual([]);
    await page.screenshot({
      path: `test-results/template-${t.id}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Neu", exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test("template filters share the driver count with previews and creation, and clear hidden choices", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Neuen RBS anlegen/ }).click();
  const create = page.getByRole("button", { name: "Rennbildschirm erstellen" });
  await page
    .getByLabel("Fahreranzahl der Vorlage", { exact: true })
    .selectOption("2");
  await page.getByLabel("Fahrer-Anordnung filtern").selectOption("horizontal");
  await page.getByLabel("Farbwelt filtern").selectOption("light");
  await expect(page.locator(".template-options > button")).toHaveCount(4);
  await page.locator('[data-template="lemon"]').click();
  await expect(page.locator(".template-selection")).toContainText(
    "Zitronen-Duell · 2 Fahrer",
  );
  await page
    .getByLabel("Fahreranzahl der Vorlage", { exact: true })
    .selectOption("6");
  await expect(page.locator(".template-options > button")).toHaveCount(1);
  await expect(page.locator('[data-template="paper"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByLabel("Fahreranzahl der Vorlage", { exact: true })
    .selectOption("8");
  await expect(
    page.getByText("Keine passende Vorlage", { exact: true }),
  ).toBeVisible();
  await expect(create).toBeDisabled();
  await page
    .locator(".template-empty")
    .getByRole("button", { name: "Filter zurücksetzen" })
    .click();
  await expect(create).toBeEnabled();
  await expect(
    page.getByLabel("Fahreranzahl der Vorlage", { exact: true }),
  ).toHaveValue("8");
  await page.getByLabel("Farbwelt filtern").selectOption("light");
  await page
    .getByLabel("Fahreranzahl der Vorlage", { exact: true })
    .selectOption("4");
  await page.locator('[data-template="sunshine"]').click();
  await page.screenshot({
    path: "test-results/Vorlagen-hell.png",
    fullPage: true,
  });
  await page
    .getByLabel("Fahreranzahl der Vorlage", { exact: true })
    .selectOption("8");
  await page.getByLabel("Fahrer-Anordnung filtern").selectOption("grid");
  await expect(page.locator(".template-options > button")).toHaveCount(3);
  await page.locator('[data-template="mint"]').click();
  await create.click();
  await expect(page.locator(".canvas-topline")).toContainText("8 Fahrer");
  await expect(
    page.locator(".workspace .artboard > rect").first(),
  ).toHaveAttribute("fill", /^#eaf8f1$/i);
});

test("light template picker keeps filters and creation visible in a small window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: /Neuen RBS anlegen/ }).click();
  await page
    .getByLabel("Fahreranzahl der Vorlage", { exact: true })
    .selectOption("2");
  await page.getByLabel("Farbwelt filtern").selectOption("light");
  const dialog = page.getByRole("dialog");
  const bounds = await dialog.boundingBox();
  const create = page.getByRole("button", { name: "Rennbildschirm erstellen" });
  const footer = await create.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(
    bounds!.y + bounds!.height,
  );
  await page.locator('[data-template="garden"]').click();
  await expect(page.locator('[data-template="garden"]')).toBeInViewport({
    ratio: 1,
  });
  await expect(page.getByLabel("Farbwelt filtern")).toBeInViewport();
  await expect(create).toBeInViewport();
  await page.screenshot({
    path: "test-results/Vorlagen-hell-klein.png",
    fullPage: true,
  });
  await create.click();
  await expect(page.locator(".canvas-topline")).toContainText("2 Fahrer");
});
