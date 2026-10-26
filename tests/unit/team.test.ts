import { describe, expect, it } from "vitest";
import { formatStat, getDriver, team } from "@/content/team";
import en from "@/messages/en";
import pl from "@/messages/pl";

describe("team", () => {
  it("finds drivers by their page slug", () => {
    expect(getDriver("21-wierzbicki")?.lastName).toBe("Wierzbicki");
    expect(getDriver("08-moreau")?.number).toBe("08");
    expect(getDriver("aranda")).toBeUndefined();
  });

  it("writes stats the way the counters end", () => {
    expect(formatStat(42, "int")).toBe("42");
    expect(formatStat(98.5, "dec1")).toBe("98.5");
    expect(formatStat(72.408, "lap")).toBe("1:12.408");
    expect(formatStat(0, "lap")).toBe("0:00.000");
  });

  it("has a story for every helmet and a label for every stat in both languages", () => {
    for (const messages of [en, pl]) {
      for (const d of team.drivers) {
        for (const h of d.helmets) {
          expect(messages.team.helmetStories[`${d.number}-${h.slug}` as keyof typeof messages.team.helmetStories]).toBeTruthy();
        }
        for (const s of d.stats) expect(messages.team.stats[s.key as keyof typeof messages.team.stats]).toBeTruthy();
        for (const p of d.paddock) {
          expect(messages.team.paddockCaptions[p as keyof typeof messages.team.paddockCaptions]).toBeTruthy();
        }
      }
    }
  });
});
