import { openEditor } from "./helpers";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
const requests: Record<string, unknown>[] = JSON.parse(
  fs.readFileSync(
    new URL("../fixtures/reference-font-requests.json", import.meta.url),
    "utf8",
  ),
);
const metrics = JSON.parse(
  fs.readFileSync(
    new URL("../fixtures/reference-font-metrics.json", import.meta.url),
    "utf8",
  ),
);
import type { Page } from "@playwright/test";
async function nativeReference(
  page: Page,
  assets: Record<string, string> = {},
) {
  await page.getByRole("button", { name: "Originaltexte anzeigen" }).click();
  await page.evaluate(
    ({ requests, metrics, assets }) => {
      (window as any).isTauri = true;
      (window as any).__TAURI_INTERNALS__ = {
        invoke: async (command: string, args: any) => {
          if (command === "load_assets") return [assets, []];
          if (command !== "measure_rbs_text")
            throw Error(`Unexpected IPC: ${command}`);
          return args.requests.map((request: any) => {
            const index = requests.findIndex((r) =>
              Object.entries(r).every(([k, v]) => request[k] === v),
            );
            if (index < 0)
              throw Error(`Missing native metric: ${JSON.stringify(request)}`);
            return metrics[index];
          });
        },
      };
    },
    { requests, metrics, assets },
  );
}

test("Windows metrics produce the field bounds in the supplied Cockpit reference", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openEditor(page);
  await nativeReference(page);
  const source = `<?xml version="1.0" encoding="utf-8"?><RennScreen><base><dim xmax="1912" ymax="1008"/><defaults ft="Arial"/></base><variablen>
  <runde xpos="708" ypos="298" fh="96" fs="b" fc="slotcolor" fdc="000000FF" fa="right">9999</runde>
  <fahrersn xpos="160" ypos="9" fh="72" fs="b" fa="center">MMM</fahrersn>
  <rennzeit xpos="1433" ypos="8" fh="160" fs="b" fa="center">120:00</rennzeit>
  </variablen></RennScreen>`;
  await page.locator("#browser-file").setInputFiles({
    name: "Reference.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(source),
  });
  const laps = page
    .locator(".rbs-element")
    .filter({ has: page.locator("text", { hasText: "9999" }) });
  await expect(laps.locator("text")).toHaveAttribute("font-size", "83");
  await expect(laps).toHaveAttribute("transform", "translate(708,298)");
  await expect(laps.locator("text")).toHaveAttribute("y", "77");
  await expect(laps.locator("text")).toHaveAttribute("x", "184");
  await expect(laps.locator("text")).toHaveAttribute("textLength", "184");
  await expect(laps.locator("text")).toHaveAttribute("fill", /^#ff0000$/i);
  await expect(laps.locator("rect")).toHaveAttribute("width", "184");
  await expect(laps.locator("rect")).toHaveAttribute("height", "96");
  const name = page
    .locator(".rbs-element")
    .filter({ has: page.locator("text", { hasText: "MMM" }) });
  await expect(name.locator("text")).toHaveAttribute("x", "79.5");
  await expect(name.locator("rect")).toHaveAttribute("width", "159");
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
  expect(errors).toEqual([]);
});

test("installed reference screen renders at its saved coordinates", async ({
  page,
}) => {
  const path =
    "C:/ProgramData/Cockpit-V2/RennBildschirm/cockpit/6 Fahrer/Cp-6S-07 Rennen 1920x1080/Rennen.xml";
  test.skip(!fs.existsSync(path), "Installed Cockpit reference is unavailable");
  await openEditor(page);
  const assets: Record<string, string> = {};
  for (const file of ["box.jpg", "tanken.jpg", "Cp_Logo-V3-50x50.png"])
    assets[file] =
      `data:image/${file.endsWith("png") ? "png" : "jpeg"};base64,${fs.readFileSync(path.replace("Rennen.xml", file)).toString("base64")}`;
  await nativeReference(page, assets);
  await page.locator("#browser-file").setInputFiles(path);
  const laps = page.locator('.rbs-element[transform="translate(708,298)"]');
  await expect(laps.locator("text")).toHaveAttribute("font-size", "83");
  await expect(laps.locator("text")).toHaveAttribute("fill", /^#ff0000$/i);
  const redBox = page
    .locator('.rbs-element[transform="translate(10,10)"] > rect')
    .first();
  await expect(redBox).toHaveAttribute("stroke", /^#ff0000$/i);
  await expect(
    page.locator('.rbs-element[transform="translate(1544,345)"] image'),
  ).toHaveAttribute("width", "48");
  await expect(
    page.locator('.rbs-element[transform="translate(1220,296)"] > rect').nth(1),
  ).toHaveAttribute("width", "260");
  await page.setViewportSize({ width: 2650, height: 1300 });
  await page.getByTitle("Auf 100 % setzen").click();
  await page
    .locator(".artboard")
    .screenshot({ path: "test-results/Cp-6S-07-Referenz.png" });
  await page.getByRole("button", { name: "XML", exact: true }).click();
  expect(await page.getByLabel("XML-Quelltext").inputValue()).toBe(
    fs.readFileSync(path, "latin1").replaceAll("\r\n", "\n"),
  );
});
