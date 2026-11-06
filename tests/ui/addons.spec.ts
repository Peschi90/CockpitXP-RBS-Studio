import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
function source(script: string) {
  return `<AddOnClasses><StartRealTime><![CDATA[${script}]]></StartRealTime></AddOnClasses>`;
}
test("interacts with virtual dialogs, exports spreadsheet data and keeps two addons active", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Simulator BETA" }).click();
  await page.locator(".runtime-panel > summary").click();
  await page.locator(".addon-panel > summary").click();
  await page.locator("#addon-file").setInputFiles({
    name: "Dialog.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      source(`var f:TForm;b:TButton;l:TLabel;n:Integer;
 procedure Click(Sender:TButton);begin Inc(n);l.Caption:='Joker: '+IntToStr(n);end;
 begin f:=TForm.Create(nil);f.Caption:='Joker-Test';f.Width:=340;f.Height:=120;l:=TLabel.Create(f);l.Parent:=f;l.SetBounds(10,15,200,30);l.Caption:='Joker: 0';b:=TButton.Create(f);b.Parent:=f;b.SetBounds(220,15,80,35);b.Caption:='Plus';b.OnClick:=@Click;cpShow(f);while f.ModalResult=mrNone do cpSleep(100);cpFormFree(f);end.`),
    ),
  });
  await page
    .getByRole("button", { name: "AddOn starten", exact: true })
    .click();
  await page.getByRole("button", { name: "Plus", exact: true }).click();
  await expect(page.locator(".virtual-window")).toContainText("Joker: 1");
  await page.locator("#addon-file").setInputFiles({
    name: "Excel.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(
      source(
        "var e:Variant;begin e:=CreateOleObject('Excel.Application');e.Workbooks.Add;e.Cells[1,1].Value:='Runde';e.Cells[1,2].Value:='Zeit';e.Cells[2,1].Value:=1;e.Cells[2,2].Value:='8,321';e.Visible:=True;end.",
      ),
    ),
  });
  await page
    .getByRole("button", { name: "AddOn starten", exact: true })
    .click();
  await expect(page.locator(".addon-results table")).toContainText("8,321");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "CSV exportieren", exact: true })
    .click();
  expect(fs.readFileSync((await (await download).path())!, "utf8")).toContain(
    '"1";"8,321"',
  );
  await page
    .getByRole("button", { name: "Dialog.xml · läuft", exact: true })
    .click();
  await expect(page.locator(".virtual-window")).toContainText("Joker: 1");
  await page
    .getByRole("button", { name: "Dialog schließen", exact: true })
    .click();
  await expect(page.locator(".virtual-window")).toHaveCount(0);
  await page
    .getByRole("button", { name: "AddOn stoppen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Excel.xml · läuft", exact: true })
    .click();
  await expect(page.locator(".addon-results table")).toContainText("8,321");
  await expect(page.locator(".document-dot")).not.toHaveClass(/dirty/);
  expect(errors).toEqual([]);
});
test("renders the installed joker dialog and runs its plus callback", async ({
  page,
}) => {
  const file = path.resolve(
    "../../Cp-ChaosHandlingCU-Arduino_dialog/AddOn.cps.xml",
  );
  test.skip(!fs.existsSync(file), "Local Cockpit addon is absent");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Simulator BETA" }).click();
  await page.locator(".runtime-panel > summary").click();
  await page.locator(".addon-panel > summary").click();
  await page.locator("#addon-file").setInputFiles(file);
  await page
    .getByRole("button", { name: "AddOn starten", exact: true })
    .click();
  await page
    .getByText("Eingänge, Tasten und Fahrzeugwerte", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "J · Joker-Dialog", exact: true })
    .click();
  await expect(page.locator(".virtual-window")).toBeVisible();
  const text = await page.locator(".virtual-window").textContent();
  await page
    .locator(".virtual-window")
    .getByRole("button", { name: "+", exact: true })
    .first()
    .click();
  await expect(page.locator(".virtual-window")).not.toHaveText(text!);
  fs.mkdirSync("release/0.4.0", { recursive: true });
  await page
    .locator(".virtual-window")
    .screenshot({ path: "test-results/AddOn-Joker-Dialog.png" });
  await page
    .getByRole("button", { name: "Dialog schließen", exact: true })
    .click();
  await expect(page.locator(".virtual-window")).toHaveCount(0);
  expect(errors).toEqual([]);
});
