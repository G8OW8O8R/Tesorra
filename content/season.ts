import { z } from "zod";
import { images, type ImageKey } from "@/lib/images";

export const disciplines = ["drift", "formula", "moto"] as const;
export type Discipline = (typeof disciplines)[number];

const roundSchema = z.object({
  round: z.number().int().positive(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  discipline: z.enum(disciplines),
  /** Event name as the organiser bills it. */
  name: z.string().min(1),
  venue: z.string().min(1),
  city: z.string().min(1),
  country: z.string().length(2),
  /** IANA zone of the venue, for local dates and times. */
  timeZone: z.string().min(1),
  /** Race start with the venue's UTC offset. */
  start: z.iso.datetime({ offset: true }),
  /** Length of the race session in hours (calendar entries). */
  hours: z.number().positive(),
  image: z.custom<ImageKey>((value) => typeof value === "string" && value in images),
  /** Finished rounds: where the Tesorra driver ended up. */
  result: z
    .object({
      position: z.number().int().positive(),
      line: z.string().min(1),
    })
    .optional(),
});

export type Round = z.infer<typeof roundSchema>;

const seasonSchema = z
  .object({
    year: z.number().int(),
    rounds: z.array(roundSchema).min(1),
  })
  .refine((s) => s.rounds.every((r, i) => i === 0 || Date.parse(r.start) > Date.parse(s.rounds[i - 1].start)), {
    message: "Rounds must be in date order",
  });

export const season = seasonSchema.parse({
  year: 2026,
  rounds: [
    {
      round: 1,
      slug: "gdansk-harbour-night",
      discipline: "drift",
      name: "Harbour Night Drift",
      venue: "Pier 7 Drift Arena",
      city: "Gdańsk",
      country: "PL",
      timeZone: "Europe/Warsaw",
      start: "2026-09-26T20:30:00+02:00",
      hours: 3,
      image: "events/drift-arena",
      result: { position: 2, line: "98.5 in qualifying, lost the final tandem on a one-more-time." },
    },
    {
      round: 2,
      slug: "sierra-alta-sprint",
      discipline: "moto",
      name: "Sierra Alta Sprint",
      venue: "Sierra Alta Ring",
      city: "Granada",
      country: "ES",
      timeZone: "Europe/Madrid",
      start: "2026-10-10T14:00:00+02:00",
      hours: 2,
      image: "events/moto-corner",
      result: { position: 3, line: "From P11 on the grid; two knee sliders gone by lap nine." },
    },
    {
      round: 3,
      slug: "marseille-night-street",
      discipline: "formula",
      name: "Night Street Circuit",
      venue: "Vieux-Port Street Circuit",
      city: "Marseille",
      country: "FR",
      timeZone: "Europe/Paris",
      start: "2026-10-31T21:00:00+01:00",
      hours: 2,
      image: "events/street-circuit",
    },
    {
      round: 4,
      slug: "rotterdam-dockside-tandem",
      discipline: "drift",
      name: "Dockside Tandem Battle",
      venue: "Kessel Docks",
      city: "Rotterdam",
      country: "NL",
      timeZone: "Europe/Amsterdam",
      start: "2026-11-14T20:00:00+01:00",
      hours: 3,
      image: "events/drift-arena",
    },
    {
      round: 5,
      slug: "costa-negra-200",
      discipline: "moto",
      name: "Costa Negra 200",
      venue: "Costa Negra Loop",
      city: "Valencia",
      country: "ES",
      timeZone: "Europe/Madrid",
      start: "2026-11-28T13:00:00+01:00",
      hours: 2,
      image: "events/moto-corner",
    },
    {
      round: 6,
      slug: "lisbon-riverside-finale",
      discipline: "formula",
      name: "Riverside Finale",
      venue: "Tejo Riverside Circuit",
      city: "Lisbon",
      country: "PT",
      timeZone: "Europe/Lisbon",
      start: "2026-12-12T18:00:00+00:00",
      hours: 2,
      image: "events/start-straight",
    },
  ],
});

/** Who races for the team in each discipline. */
export const disciplineDriver: Record<Discipline, string> = {
  drift: "Kuba Wierzbicki #21",
  formula: "Elena Moreau #8",
  moto: "Tomás Aranda #36",
};

export function roundStart(r: Round) {
  return new Date(r.start);
}

export function roundEnd(r: Round) {
  return new Date(Date.parse(r.start) + r.hours * 3600_000);
}

/** Rounds that have not started yet, soonest first. */
export function upcomingRounds(now: Date, limit = season.rounds.length) {
  return season.rounds.filter((r) => Date.parse(r.start) > now.getTime()).slice(0, limit);
}
