/** Resolves once `find` returns an element (checked each frame), or after `timeout` ms regardless. */
function waitFor(find: () => Element | null, timeout: number) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const check = () => {
      if (find() || performance.now() - start > timeout) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}

export const HERO_NAME = "product-hero";

/**
 * Opens a product with its picture carried over: `picture` is snapshotted as the shared element,
 * the router goes to `href`, and the transition ends once the product page's `[data-product-hero]`
 * is in. Without the View Transitions API (or under reduced motion) it just navigates.
 */
export function carryInto(href: string, picture: HTMLElement | null, go: (href: string) => void) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!picture || reduced || typeof document.startViewTransition !== "function") {
    go(href);
    return;
  }
  picture.style.viewTransitionName = HERO_NAME;
  document.startViewTransition(async () => {
    picture.style.viewTransitionName = "";
    go(href);
    await waitFor(() => document.querySelector("[data-product-hero]"), 2500);
  });
}
