import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = ["/en", "/en/store", "/en/team/21-wierzbicki", "/en/store/team-cap", "/en/checkout", "/pl/legal"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("tesorra:intro", "1"));
});

for (const path of pages) {
  test(`no axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Let entrance animations settle so contrast is measured on the final colours.
    await page.waitForTimeout(1500);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("menu: keyboard opens, cycles focus and Escape closes", async ({ page }) => {
  await page.goto("/en/store");
  const toggle = page.locator('[aria-controls="site-menu"]');
  await toggle.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "Site menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link").first()).toBeFocused();
  for (let i = 0; i < 30; i++) await page.keyboard.press("Tab");
  const inside = await page.evaluate(
    () => !!document.activeElement?.closest("#site-menu") || document.activeElement?.getAttribute("aria-controls") === "site-menu",
  );
  expect(inside).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("box drawer: keyboard opens and Escape closes", async ({ page }) => {
  await page.goto("/en/store/team-cap");
  await page.getByRole("button", { name: "Add to box" }).first().click();
  const box = page.locator("header").getByRole("button", { name: /box/i });
  await box.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog").filter({ has: page.getByRole("link", { name: "Checkout" }) });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});
