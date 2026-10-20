import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Passw0rd!e2e";

export function uniqueEmail(tag = "u") {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Register through the UI; lands on the app (dashboard). */
export async function register(page: Page, name = "E2E User", email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/\/register/);
  return email;
}

export async function logout(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Goals page -> New goal -> "Start blank". Leaves you on the details form. */
export async function startBlankGoal(page: Page) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  await expect(page).toHaveURL(/\/goals\/new$/);
  await page.getByRole("link", { name: /Start blank/ }).click();
  await expect(page).toHaveURL(/\/goals\/new\/details/);
}

export async function pickSegment(page: Page, group: string, option: string | RegExp) {
  await page.getByRole("group", { name: group, exact: true }).getByRole("button", { name: option }).click();
}

/** Open the check-in modal from the goal detail page, save it. */
export async function checkIn(page: Page, opts: { value?: string } = {}) {
  await page.getByRole("button", { name: "Log check-in" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Log check-in" });
  await expect(dlg).toBeVisible();
  if (opts.value !== undefined) await dlg.locator('input[type="number"]').fill(opts.value);
  await dlg.getByRole("button", { name: /Solid/ }).click(); // effort 3 is required
  await dlg.getByRole("button", { name: "Save check-in" }).click();
  await expect(dlg).toBeHidden();
}

export async function goalIdFromUrl(page: Page) {
  await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}
