import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
const source = (extra = 'len="2"') =>
  `<?xml version="1.0" encoding="utf-8"?><RennScreen><base><dim xmax="800" ymax="600" slots="1"/></base><variablen><!-- behalten --><fahrer left="60" top="80" nr="1" fh="36" ft="Arial" fs="b" fc="00FFFFFF" custom="bleibt" ${extra}>Fahrername</fahrer></variablen></RennScreen>`;
async function load(page: Page, xml: string) {
  await page.goto("/");
  await page
    .locator("#browser-file")
    .setInputFiles({
      name: "Length.xml",
      mimeType: "application/xml",
      buffer: Buffer.from(xml),
    });
  await page.getByTitle("Auf 100 % setzen").click();
  await page.locator(".layer-row").first().click();
}
async function changeLength(page: Page, length: string) {
  await page.getByLabel("Platzhalterlänge", { exact: true }).fill(length);
  await page.getByLabel("Platzhalterlänge", { exact: true }).blur();
}
async function field(page: Page) {
  return page
    .locator(".workspace .rbs-element")
    .first()
    .evaluate((el) => {
      const text = el.querySelector("text")!;
      const clipId = text.getAttribute("clip-path")!.slice(5, -1);
      const clip = document.getElementById(clipId)!.querySelector("rect")!;
      const outline = document.querySelector(".selection-outline")!;
      return {
        width: Number(clip.getAttribute("width")),
        hitWidth: Number(el.querySelector("rect")!.getAttribute("width")),
        outlineWidth: Number(outline.getAttribute("width")),
        textWidth: text.getBBox().width,
        x: Number(text.getAttribute("x")),
        transform: el.getAttribute("transform"),
      };
    });
}
for (const alignment of ["left", "center", "right"]) {
  test(`placeholder length updates outline, clipping and ${alignment} alignment, survives export/reopen`, async ({
    page,
  }) => {
    await load(page, source(`len="2" fa="${alignment}"`));
    const before = await field(page);
    expect(before.width).toBeLessThan(before.textWidth);
    await changeLength(page, "20");
    const after = await field(page);
    expect(after.width).toBeGreaterThan(after.textWidth);
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.hitWidth).toBe(after.width);
    expect(after.outlineWidth).toBeCloseTo(after.width + 6, 3);
    expect(after.transform).toBe("translate(60,80)");
    expect(after.x).toBe(
      alignment === "left"
        ? 0
        : alignment === "center"
          ? after.width / 2
          : after.width,
    );
    await changeLength(page, "5");
    expect((await field(page)).width).toBeLessThan(after.width);
    await page.getByTitle("Rückgängig · Strg Z").click();
    await page.locator(".layer-row").first().click();
    await expect(
      page.getByLabel("Platzhalterlänge", { exact: true }),
    ).toHaveValue("20");
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Speichern", exact: true }).click();
    const file = await downloading;
    const saved = fs.readFileSync((await file.path())!, "utf8");
    expect(saved).toContain('len="20"');
    expect(saved).toContain("<!-- behalten -->");
    expect(saved).toContain('custom="bleibt"');
    expect(saved).toContain(">Fahrername</fahrer>");
    await page
      .locator("#browser-file")
      .setInputFiles({
        name: "Reload.xml",
        mimeType: "application/xml",
        buffer: Buffer.from(saved),
      });
    await page.getByTitle("Auf 100 % setzen").click();
    await page.locator(".layer-row").first().click();
    expect((await field(page)).width).toBeCloseTo(after.width, 3);
    await page.getByRole("button", { name: "Originaltexte anzeigen" }).click();
    expect((await field(page)).width).toBeCloseTo(after.width, 3);
    if (alignment === "left")
      await page.screenshot({
        path: "test-results/Platzhalterlaenge.png",
        fullPage: true,
      });
  });
}
test("fixed-width text exposes typography and length; manual sizing restores explicit width", async ({
  page,
}) => {
  await load(page, source('breite="80" hoehe="44" len="0"'));
  await expect(page.getByLabel("Schriftgröße", { exact: true })).toBeVisible();
  expect((await field(page)).width).toBe(80);
  await changeLength(page, "20");
  const wide = await field(page);
  expect(wide.width).toBeGreaterThan(80);
  await expect(page.getByLabel("Breite", { exact: true })).toHaveValue(
    String(wide.width),
  );
  await page.getByLabel("Breite", { exact: true }).fill("180");
  await page.getByLabel("Breite", { exact: true }).blur();
  await expect(
    page.getByLabel("Platzhalterlänge", { exact: true }),
  ).toHaveValue("0");
  expect((await field(page)).width).toBe(180);
  await changeLength(page, "4");
  expect((await field(page)).width).toBeLessThan(180);
  await changeLength(page, "0");
  expect((await field(page)).width).toBe(180);
});
test("numeric masks keep their format; their inspector explains the preview text", async ({
  page,
}) => {
  await load(
    page,
    source('len="17"')
      .replaceAll("fahrer", "rennzeit")
      .replace("Fahrername", "0:00:00,0"),
  );
  await expect(
    page.getByLabel("Platzhalterlänge", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Bei Zahlen und Zeiten bestimmt der Vorschautext das Feldformat und die automatische Breite.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Elementtext")).toHaveValue("0:00:00,0");
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
});
