import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format";

describe("formatPrice", () => {
  it("drops cents on whole euros", () => {
    expect(formatPrice(4900, "en")).toBe("€49");
  });

  it("keeps cents when present", () => {
    expect(formatPrice(349, "en")).toBe("€3.49");
  });

  it("uses Polish separators and symbol placement", () => {
    expect(formatPrice(349, "pl").replace(/\s/g, " ")).toBe("3,49 €");
  });
});
