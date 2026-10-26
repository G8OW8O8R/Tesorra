import { describe, expect, it } from "vitest";
import { boxSubtotal, lineId } from "@/lib/cart";
import { checkoutErrors, orderNumber } from "@/lib/checkout";
import { code39 } from "@/lib/code39";
import { categories, FREE_SHIPPING_CENTS, floatItems, getProduct, products, relatedProducts, shippingFor } from "@/content/store";
import { FIELD, FIELD_SCREENS, fieldCounts, fieldLayout, interleave, LAYERS } from "@/lib/store-float";
import en from "@/messages/en";
import pl from "@/messages/pl";

describe("store catalogue", () => {
  it("has texts in both languages for every product", () => {
    for (const p of products) {
      expect(en.store.products).toHaveProperty(p.slug);
      expect(pl.store.products).toHaveProperty(p.slug);
    }
  });

  it("covers every part of the store", () => {
    for (const c of categories) expect(products.some((p) => p.category === c)).toBe(true);
  });

  it("floats each flavour as its own can", () => {
    const drinks = floatItems("drink");
    expect(drinks.filter((i) => i.product.slug === "energy")).toHaveLength(3);
    expect(floatItems("all").length).toBe(products.length + 2);
  });

  it("finds three related products, never the product itself", () => {
    const helmet = getProduct("helmet-21")!;
    const related = relatedProducts(helmet);
    expect(related).toHaveLength(3);
    expect(related.map((p) => p.slug)).not.toContain("helmet-21");
    expect(related.every((p) => p.category === "helmets")).toBe(true);
  });

  it("ships free from the threshold", () => {
    expect(shippingFor(0)).toBe(0);
    expect(shippingFor(FREE_SHIPPING_CENTS - 1)).toBeGreaterThan(0);
    expect(shippingFor(FREE_SHIPPING_CENTS)).toBe(0);
    expect(shippingFor(FREE_SHIPPING_CENTS, "express")).toBeGreaterThan(0);
  });

  it("adds up the box", () => {
    const lines = [
      { id: lineId("energy", "cherry"), slug: "energy", option: "cherry", qty: 2 },
      { id: lineId("team-cap"), slug: "team-cap", qty: 1 },
    ];
    expect(boxSubtotal(lines)).toBe(2 * 350 + 3900);
  });
});

describe("float space", () => {
  it("spreads the field over the whole width, never two products of a layer too close", () => {
    for (const [density, aspect] of [
      [FIELD.desktop, 16 / 9],
      [FIELD.phone, 9 / 19.5],
    ] as const) {
      const points = fieldLayout(aspect, density);
      expect(points).toHaveLength(fieldCounts(density.perScreen).reduce((a, b) => a + b, 0));
      expect(fieldLayout(aspect, density)).toEqual(points);
      const xs = points.map((p) => p.x);
      expect(Math.min(...xs)).toBeLessThan(0.15);
      expect(Math.max(...xs)).toBeGreaterThan(0.85);
      for (const p of points) {
        expect(p.y).toBeLessThanOrEqual(LAYERS[p.layer].speed * (FIELD_SCREENS - 1) + 1);
        for (const q of points) {
          if (p === q || p.layer !== q.layer) continue;
          expect(Math.hypot((p.x - q.x) * aspect, p.y - q.y)).toBeGreaterThanOrEqual(density.gap * aspect);
        }
      }
    }
  });

  it("mixes the whole store so neighbours come from different parts", () => {
    const mixed = interleave(["a1", "a2", "a3", "b1", "c1", "c2"], (s) => s[0]);
    expect(mixed).toEqual(["a1", "b1", "c1", "a2", "c2", "a3"]);
  });
});

describe("checkout", () => {
  const ok = {
    email: "kuba@tesorra.racing",
    phone: "+48 600 100 200",
    name: "Kuba Wierzbicki",
    street: "Ulica Bokiem 21",
    postcode: "50-001",
    city: "Wrocław",
    country: "PL",
    speed: "standard",
  } as const;

  it("accepts a complete form", () => {
    expect(checkoutErrors(ok)).toEqual({});
  });

  it("names the fields that are wrong", () => {
    expect(checkoutErrors({ ...ok, email: "kuba@", postcode: "!", name: "" })).toEqual({
      email: "email",
      postcode: "postcode",
      name: "required",
    });
    expect(checkoutErrors({ ...ok, phone: "call me" })).toEqual({ phone: "phone" });
  });

  it("makes order numbers that code 39 can carry", () => {
    const n = orderNumber();
    expect(n).toMatch(/^TR-[A-Z2-9]{6}$/);
    expect(code39(n).bars).toHaveLength((n.length + 2) * 5);
  });
});

describe("code 39", () => {
  it("frames the text with start and stop and has five bars a character", () => {
    const { bars, width } = code39("TR-4K9Q2X");
    // 9 characters + start + stop, five bars each.
    expect(bars).toHaveLength(11 * 5);
    // Each character is 15 units (6 narrow + 3 wide), plus a 1-unit gap between characters.
    expect(width).toBe(11 * 15 + 10);
  });

  it("drops characters it cannot encode", () => {
    expect(code39("a b").bars).toHaveLength(code39("AB").bars.length);
  });
});
