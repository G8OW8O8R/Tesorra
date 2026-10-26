import { expect, test } from "@playwright/test";

test("without WebGL2 the home page shows the poster instead of the scene", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("tesorra:intro", "1");
    // No OffscreenCanvas keeps the scene on this thread, where WebGL2 is then refused.
    Reflect.deleteProperty(window, "OffscreenCanvas");
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === "webgl2") return null;
      return (getContext as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof getContext;
  });
  await page.goto("/en");
  await expect(page.locator("[data-scene] img")).toBeAttached({ timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
