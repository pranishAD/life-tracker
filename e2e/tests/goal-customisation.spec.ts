import { expect, test } from "@playwright/test";
import { checkIn, goalIdFromUrl, login, logout, pickSegment, register, startBlankGoal, uniqueEmail } from "./helpers";

// Covers TC-GC-01 .. TC-GC-08 in docs/test-plan.md (goal customisation, API v1.1.0).

test.describe("Goal customisation", () => {
  test("TC-GC-01 template -> create -> check-in -> shows on dashboard", async ({ page }) => {
    await register(page);
    await page.goto("/goals");
    await page.getByRole("button", { name: "New goal" }).first().click();
    await expect(page.getByText("Step 1 of 2 · Pick a start").last()).toBeVisible();
    await page.getByRole("link", { name: /Gym 4x a week/ }).click();

    await expect(page.getByText("From template: Gym 4x a week")).toBeVisible();
    await expect(page.locator("#goal-name")).toHaveValue("Gym 4x a week");
    await page.getByRole("button", { name: "Create goal" }).first().click();

    await goalIdFromUrl(page);
    await expect(page.getByRole("heading", { level: 1, name: "Gym 4x a week" })).toBeVisible();
    await expect(page.getByText("Goal created. Log your first check-in when you're ready.")).toBeVisible();

    await checkIn(page);
    await page.goto("/dashboard");
    await expect(page.getByText("Gym 4x a week").first()).toBeVisible();
  });

  test("TC-GC-02 edit: type locked after check-in, change emoji/colour/category, save", async ({ page }) => {
    await register(page);
    await page.goto("/goals/new/details?template=gym-4x-week");
    await page.getByRole("button", { name: "Create goal" }).first().click();
    const id = await goalIdFromUrl(page);
    await checkIn(page);

    await page.goto(`/goals/${id}/edit`);
    await expect(page.getByRole("heading", { name: "Edit goal" })).toBeVisible();
    await expect(page.getByText(/1 check-in/)).toBeVisible();
    await expect(page.getByText("Type can't change once a goal has check-ins.")).toBeVisible();
    const typeGroup = page.getByRole("group", { name: "Goal type" });
    for (const b of await typeGroup.getByRole("button").all()) await expect(b).toBeDisabled();

    await page.getByRole("group", { name: "Category", exact: true }).getByRole("button", { name: /Study/ }).click();

    await page.getByRole("button", { name: "Change emoji and colour" }).click();
    const picker = page.getByRole("dialog", { name: "Pick emoji and colour" });
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Violet", exact: true }).click();
    await picker.getByRole("button", { name: "🔥" }).first().click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Save changes" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/goals/${id}$`));
    await expect(page.getByText("Changes saved.")).toBeVisible();
    await expect(page.getByText("Study").first()).toBeVisible();
    await expect(page.getByText("🔥").first()).toBeVisible();

    await page.reload();
    await expect(page.getByText("🔥").first()).toBeVisible();
    await expect(page.getByText("Study").first()).toBeVisible();
  });

  test("TC-GC-03 archive -> Archived list -> restore", async ({ page }) => {
    await register(page);
    await page.goto("/goals/new/details?template=gym-4x-week");
    await page.getByRole("button", { name: "Create goal" }).first().click();
    const id = await goalIdFromUrl(page);

    await page.goto(`/goals/${id}/edit`);
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByText("Goal archived. Find it under Goals › Archived.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No goals yet" })).toBeVisible();

    await page.getByRole("button", { name: "archived", exact: true }).click();
    await expect(page.getByRole("link", { name: /Gym 4x a week/ })).toBeVisible();

    await page.getByRole("link", { name: /Gym 4x a week/ }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.goto(`/goals/${id}/edit`);
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Goal restored to Active.")).toBeVisible();

    await page.goto("/goals");
    await expect(page.getByRole("link", { name: /Gym 4x a week/ })).toBeVisible();
    await page.getByRole("button", { name: "archived", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No archived goals" })).toBeVisible();
  });

  test("TC-GC-04 numeric decrease 90 -> 80: progress rises as value drops", async ({ page }) => {
    await register(page);
    await startBlankGoal(page);
    await page.locator("#goal-name").fill("Cut weight");
    await pickSegment(page, "Goal type", "Numeric");
    await page.locator("#goal-start").fill("90");
    await page.locator("#goal-target").fill("80");
    await page.locator("#goal-unit").fill("kg");
    await expect(page.getByText(/Set automatically: your target is lower than your start/)).toBeVisible();
    await expect(page.getByRole("group", { name: "Direction" }).getByRole("button", { name: "Decrease" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Create goal" }).first().click();
    await goalIdFromUrl(page);

    await checkIn(page, { value: "85" });
    await expect(page.getByText(/85\s*(→|\/)\s*80 kg/).first()).toBeVisible();
    await expect(page.locator('[style*="width: 50%"]').first()).toBeVisible();

    await checkIn(page, { value: "82" });
    await expect(page.locator('[style*="width: 80%"]').first()).toBeVisible();
  });

  test("TC-GC-05 habit: Pick days and Every day", async ({ page }) => {
    await register(page);
    await startBlankGoal(page);
    await page.locator("#goal-name").fill("Stretch");
    await pickSegment(page, "Goal type", "Habit");

    await pickSegment(page, "Frequency", "Pick days");
    const days = page.getByRole("group", { name: "Days of the week" });
    // Mon/Wed/Fri are preselected. At least one day always stays selected.
    for (const d of ["Monday", "Wednesday", "Friday"]) await days.getByRole("button", { name: d }).click();
    await expect(days.getByRole("button", { name: "Friday" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("1 day a week")).toBeVisible();
    for (const d of ["Monday", "Wednesday"]) await days.getByRole("button", { name: d }).click();
    await expect(page.getByText(/Mon.*Wed.*Fri/).first()).toBeVisible();
    await page.getByRole("button", { name: "Create goal" }).first().click();
    const id1 = await goalIdFromUrl(page);
    await expect(page.getByText(/Habit · .*Mon.*Wed.*Fri/i).first()).toBeVisible();

    await page.goto(`/goals/${id1}/edit`);
    await expect(page.getByRole("group", { name: "Days of the week" }).getByRole("button", { name: "Wednesday" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await startBlankGoal(page);
    await page.locator("#goal-name").fill("Water");
    await pickSegment(page, "Goal type", "Habit");
    await pickSegment(page, "Frequency", "Every day");
    await expect(page.getByRole("group", { name: "Days of the week" })).toHaveCount(0);
    await page.getByRole("button", { name: "Create goal" }).first().click();
    await goalIdFromUrl(page);
    await expect(page.getByText(/Habit · Every day/i).first()).toBeVisible();
  });

  test("TC-GC-06 Settings > Categories: add, reorder, delete with goals, defaults protected", async ({ page }) => {
    await register(page);
    await page.goto("/settings?tab=categories");
    const list = page.getByRole("list", { name: "Categories" });
    await expect(list.getByRole("listitem")).toHaveCount(4);
    for (const n of ["Fitness", "Study", "Career", "Custom"]) await expect(list.getByText(n, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "New category" }).click();
    const dlg = page.getByRole("dialog", { name: "New category" });
    await dlg.getByLabel("Name").fill("Side projects");
    await dlg.getByRole("button", { name: "Create category" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(list.getByRole("listitem").last()).toContainText("Side projects");

    // Duplicate name (case-insensitive) rejected
    await page.getByRole("button", { name: "New category" }).click();
    const dup = page.getByRole("dialog", { name: "New category" });
    await dup.getByLabel("Name").fill("side projects");
    await dup.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByText(/already have a category called/)).toBeVisible();
    await dup.getByRole("button", { name: "Cancel" }).click();

    // Reorder with the keyboard: move Side projects to the top
    await page.getByRole("button", { name: "Reorder Side projects" }).focus();
    const saved = page.waitForResponse((r) => r.url().includes("/categories/order") && r.request().method() === "PATCH");
    await page.keyboard.press("Space");
    await page.waitForTimeout(400); // let dnd-kit register the pick-up before moving
    for (let i = 0; i < 5; i++) {
      // 5 presses for 4 positions: the extra is a harmless no-op at the top
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(250);
    }
    await page.keyboard.press("Space");
    expect((await saved).status()).toBe(200);
    await expect(list.getByRole("listitem").first()).toContainText("Side projects");
    await page.reload();
    await expect(list.getByRole("listitem").first()).toContainText("Side projects");

    // Default category cannot be deleted
    await page.getByRole("button", { name: "More for Fitness" }).click();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
    await expect(page.getByText("Default categories can't be deleted.").first()).toBeVisible();
    await page.keyboard.press("Escape");

    // Goal in Side projects, then delete the category moving the goal to Study
    await page.goto("/goals/new/details?template=gym-4x-week");
    await page.getByRole("group", { name: "Category", exact: true }).getByRole("button", { name: /Side projects/ }).click();
    await page.getByRole("button", { name: "Create goal" }).first().click();
    await goalIdFromUrl(page);

    await page.goto("/settings?tab=categories");
    await expect(list.getByRole("listitem").first()).toContainText("1 goal");
    await page.getByRole("button", { name: "More for Side projects" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const move = page.getByRole("dialog", { name: "Delete Side projects" });
    await expect(move).toBeVisible();
    await move.getByRole("group", { name: "Move goals to" }).getByRole("button", { name: /Study/ }).click();
    await move.getByRole("button", { name: /Move to Study and delete/ }).click();
    await expect(page.getByText(/1 goal moved to Study/)).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(4);

    await page.goto("/goals");
    await expect(page.getByRole("link", { name: /Gym 4x a week/ })).toContainText("Study");
  });

  test("TC-GC-07 'New category' disabled at 12 categories", async ({ page }) => {
    await register(page);
    await page.goto("/settings?tab=categories");
    const list = page.getByRole("list", { name: "Categories" });
    for (let i = 1; i <= 8; i++) {
      await page.getByRole("button", { name: "New category" }).click();
      const dlg = page.getByRole("dialog", { name: "New category" });
      await dlg.getByLabel("Name").fill(`Cat ${i}`);
      await dlg.getByRole("button", { name: "Create category" }).click();
      await expect(list.getByRole("listitem")).toHaveCount(4 + i);
    }
    await expect(page.getByRole("button", { name: "New category" })).toBeDisabled();
    await expect(page.getByText(/You have 12 categories, the most allowed/)).toBeVisible();

    await page.goto("/goals/new/details");
    await expect(page.getByRole("button", { name: /New category/ })).toBeDisabled();

    await page.goto("/settings?tab=categories");
    await page.getByRole("button", { name: "More for Cat 8" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText('Deleted "Cat 8".')).toBeVisible();
    await expect(page.getByRole("button", { name: "New category" })).toBeEnabled();
  });

  test("TC-GC-08 isolation: user B cannot see user A's categories or goals", async ({ page, browser }) => {
    const emailA = await register(page, "User A");
    await page.goto("/settings?tab=categories");
    await page.getByRole("button", { name: "New category" }).click();
    const dlg = page.getByRole("dialog", { name: "New category" });
    await dlg.getByLabel("Name").fill("Secret Area");
    await dlg.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByRole("list", { name: "Categories" }).getByText("Secret Area")).toBeVisible();
    await page.goto("/goals/new/details?template=gym-4x-week");
    await page.locator("#goal-name").fill("A private goal");
    await page.getByRole("button", { name: "Create goal" }).first().click();
    const idA = await goalIdFromUrl(page);

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await register(pageB, "User B", uniqueEmail("b"));
    await pageB.goto("/settings?tab=categories");
    await expect(pageB.getByRole("list", { name: "Categories" }).getByRole("listitem")).toHaveCount(4);
    await expect(pageB.getByText("Secret Area")).toHaveCount(0);
    await pageB.goto("/goals");
    await expect(pageB.getByText("A private goal")).toHaveCount(0);
    await pageB.goto(`/goals/${idA}`);
    await expect(pageB.getByText("A private goal")).toHaveCount(0);
    await pageB.goto(`/goals/${idA}/edit`);
    await expect(pageB.getByText("A private goal")).toHaveCount(0);
    await ctxB.close();

    await logout(page);
    await login(page, emailA);
    await page.goto("/goals");
    await expect(page.getByText("A private goal")).toBeVisible();
  });
});
