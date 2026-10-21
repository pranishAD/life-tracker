import { expect, test } from "@playwright/test";
import { goalIdFromUrl, register } from "./helpers";

// TC-GC-09: the goal-creation flow at 375px (footer button, no preview, no horizontal scroll).
test.use({ viewport: { width: 375, height: 812 } });

test("TC-GC-09 mobile: template list, create from fixed footer, no sideways scroll", async ({ page }) => {
  await register(page);
  await page.goto("/goals/new");
  await expect(page.getByRole("link", { name: /Run 5 km under 28 min/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: /Run 5 km under 28 min/ }).click();
  await expect(page.locator("#goal-name")).toHaveValue("Run 5 km under 28 min");
  await expect(page.getByLabel("Preview")).toBeHidden(); // preview is desktop-only
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Create goal" }).last().click();
  await goalIdFromUrl(page);
  await expect(page.getByRole("heading", { level: 1, name: "Run 5 km under 28 min" })).toBeVisible();
});

test("TC-GC-10 mobile: categories settings page and new-category sheet", async ({ page }) => {
  await register(page);
  await page.goto("/settings?tab=categories");
  const list = page.getByRole("list", { name: "Categories" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  await page.getByRole("button", { name: "New category" }).click();
  const dlg = page.getByRole("dialog", { name: "New category" });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Name").fill("Mobile cat");
  await dlg.getByRole("button", { name: "Create category" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
