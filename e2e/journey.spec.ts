import { expect, test, type Page } from "@playwright/test";

/** Skip the start lights, as on a second visit in the same session. */
async function skipIntro(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("tesorra:intro", "1"));
}

/** Waits for a ride to end: the dock ignores clicks while the camera is moving. */
async function still(page: Page) {
  await expect
    .poll(
      async () => {
        const a = await page.evaluate(() => window.scrollY);
        await page.waitForTimeout(400);
        return a === (await page.evaluate(() => window.scrollY));
      },
      { timeout: 15_000 },
    )
    .toBe(true);
}

test("start → stops → menu → driver → store → product → box → checkout → paddock pass", async ({ page }) => {
  test.setTimeout(120_000);
  await skipIntro(page);
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Ride along the stops (the strip of stops on desktop, the arrow on phones): the display follows.
  const wide = (page.viewportSize()?.width ?? 0) >= 768;
  const stop = page.locator("[data-field=number]").first();
  for (const [n, name] of [["01", "DRIFT"], ["02", "FORMULA"], ["03", "MOTO"]]) {
    if (wide) {
      // A stop in the strip is a fixed target, so clicking again (a ride in progress ignores it) is safe.
      await expect(async () => {
        await page.getByRole("button", { name: `${n} ${name}`, exact: true }).and(page.locator("[data-segment]")).click();
        await expect(stop).toHaveText(n, { timeout: 4_000 });
      }).toPass({ timeout: 30_000 });
    } else {
      await still(page);
      await page.locator("[data-ahead]").click();
      await expect(stop).toHaveText(n, { timeout: 10_000 });
    }
  }

  // Menu → team → driver.
  await page.getByRole("button", { name: "Menu", exact: false }).first().click();
  const menu = page.getByRole("dialog", { name: "Site menu" });
  await expect(menu).toBeVisible();
  const word = menu.locator('a.menu-word[href="/en/team"]');
  await word.click();
  // On touch screens the first tap opens the sub-links of the word.
  if (!wide) await word.click();
  await expect(page).toHaveURL(/\/en\/team$/);
  // The strips widen under the pointer, so open the driver from the keyboard.
  await page.getByRole("link", { name: "Kuba Wierzbicki #21" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/team\/21-wierzbicki$/);
  await expect(page.getByText("Wierzbicki").first()).toBeVisible();

  // Store as a list → product.
  await page.goto("/en/store");
  await page.getByRole("button", { name: "List" }).click();
  await page.locator('a[href="/en/store/team-cap"]').first().click();
  await expect(page).toHaveURL(/\/en\/store\/team-cap$/);

  // Into the box.
  await page.getByRole("button", { name: "Add to box" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "BOX, BOX" })).toBeVisible();
  await page.locator("header").getByRole("button", { name: /box/i }).click();
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/en\/checkout$/);

  // Demo checkout: an empty form keeps the focus on the first field with an error.
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByLabel(/Email/)).toBeFocused();
  await page.getByLabel(/Email/).fill("kuba@example.com");
  await page.getByLabel(/Full name/).fill("Kuba Wierzbicki");
  await page.getByLabel(/Street and number/).fill("Torowa 21");
  await page.getByLabel(/Postcode/).fill("50-001");
  await page.getByLabel(/City/).fill("Wrocław");
  await page.getByLabel(/Country/).selectOption("PL");
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page.getByText("ORDER CONFIRMED")).toBeVisible();
  await expect(page.getByText(/TR-[A-HJ-NP-Z2-9]{6}/).first()).toBeVisible();
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("pages render without the intro and the store starts as a list", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("data-intro", "skip");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const path of ["/en/team", "/en/team/08-moreau", "/en/store/energy", "/en/credits", "/en/legal"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("h1").first()).toBeAttached();
    }
    await page.goto("/en/store");
    await expect(page.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  });
});
