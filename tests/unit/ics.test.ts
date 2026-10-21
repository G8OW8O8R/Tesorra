import { describe, expect, it } from "vitest";
import { roundEnd, roundStart, season, upcomingRounds } from "@/content/season";
import { buildIcs, foldLine, icsDate, icsText } from "@/lib/ics";

const encoder = new TextEncoder();

const event = {
  uid: "marseille-night-street@tesorra.racing",
  title: "Tesorra Racing — R3 Night Street Circuit",
  start: new Date("2026-10-31T21:00:00+01:00"),
  end: new Date("2026-10-31T23:00:00+01:00"),
  location: "Vieux-Port Street Circuit, Marseille, FR",
  description: "Formula; Elena Moreau #8.\nStream opens on race day.",
  url: "https://example.com/en/season",
};

describe("ics", () => {
  it("writes UTC times in the basic format", () => {
    expect(icsDate(event.start)).toBe("20261031T200000Z");
  });

  it("escapes text values", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("builds a single-event calendar with CRLF line ends", () => {
    const text = buildIcs(event, new Date("2026-10-21T10:00:00Z"));
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/);
    const unfolded = text.replace(/\r\n /g, "");
    expect(unfolded).toContain("DTSTART:20261031T200000Z\r\n");
    expect(unfolded).toContain("DTEND:20261031T220000Z\r\n");
    expect(unfolded).toContain("DTSTAMP:20261021T100000Z\r\n");
    expect(unfolded).toContain("UID:marseille-night-street@tesorra.racing\r\n");
    expect(unfolded).toContain("LOCATION:Vieux-Port Street Circuit\\, Marseille\\, FR\r\n");
    expect(unfolded).toContain("DESCRIPTION:Formula\\; Elena Moreau #8.\\nStream opens on race day.\r\n");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const line = `SUMMARY:${"Ząb ".repeat(40)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((part, i) => {
      if (i > 0) expect(part.startsWith(" ")).toBe(true);
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    });
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("season", () => {
  it("has six rounds in date order across every discipline", () => {
    expect(season.rounds).toHaveLength(6);
    expect(new Set(season.rounds.map((r) => r.discipline))).toEqual(new Set(["drift", "formula", "moto"]));
    season.rounds.forEach((r) => expect(roundEnd(r).getTime()).toBeGreaterThan(roundStart(r).getTime()));
  });

  it("lists the rounds still to come, soonest first", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const next = upcomingRounds(now);
    expect(next.map((r) => r.round)).toEqual([3, 4, 5, 6]);
    expect(upcomingRounds(new Date("2027-01-01T00:00:00Z"))).toEqual([]);
  });
});
