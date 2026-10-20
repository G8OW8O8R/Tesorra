import { describe, expect, it } from "vitest";
import { hasLocale, localizePath } from "@/lib/i18n";
import { bezierAt, easing } from "@/lib/motion-tokens";
import en from "@/messages/en";
import pl from "@/messages/pl";

describe("i18n", () => {
  it("recognises supported locales only", () => {
    expect(hasLocale("en")).toBe(true);
    expect(hasLocale("pl")).toBe(true);
    expect(hasLocale("de")).toBe(false);
  });

  it("swaps the locale segment of a path", () => {
    expect(localizePath("/en/team/wierzbicki", "pl")).toBe("/pl/team/wierzbicki");
    expect(localizePath("/en", "pl")).toBe("/pl");
    expect(localizePath("/", "en")).toBe("/en");
  });

  it("keeps the same message keys in every language", () => {
    const keys = (o: object, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? keys(v, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    expect(keys(pl)).toEqual(keys(en));
  });
});

describe("motion tokens", () => {
  it("evaluates easing curves from 0 to 1", () => {
    for (const curve of Object.values(easing)) {
      expect(bezierAt(curve, 0)).toBe(0);
      expect(bezierAt(curve, 1)).toBe(1);
      expect(bezierAt(curve, 0.5)).toBeGreaterThan(0);
      expect(bezierAt(curve, 0.5)).toBeLessThan(1);
    }
    expect(bezierAt(easing.ride, 0.5)).toBeCloseTo(0.5, 3);
  });
});
