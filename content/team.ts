import { z } from "zod";
import { images, type ImageKey } from "@/lib/images";
import { disciplines } from "./season";

const imageKey = z.custom<ImageKey>((value) => typeof value === "string" && value in images);
const hex = z.string().regex(/^#[0-9a-f]{6}$/);
/** A point of a photo as shares of its width and height (where the person stands). */
const focus = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

const statSchema = z.object({
  /** Key into the driver's stat labels in messages. */
  key: z.string().min(1),
  value: z.number().nonnegative(),
  /** How the counter writes the value: whole number, one decimal, or a lap time in seconds. */
  format: z.enum(["int", "dec1", "lap"]),
  unit: z.string().optional(),
});

export type Stat = z.infer<typeof statSchema>;

const helmetSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  year: z.number().int(),
  /** Studio cut-out of the helmet. */
  image: imageKey,
  /** The driver wearing it at an event, if there is a photo. */
  worn: imageKey.optional(),
});

export type Helmet = z.infer<typeof helmetSchema>;

const driverSchema = z.object({
  slug: z.string().regex(/^\d{2}-[a-z]+$/),
  number: z.string().regex(/^\d{2}$/),
  /** Key into the driver's texts in messages. */
  key: z.enum(["kuba", "elena", "tomas"]),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  country: z.string().length(2),
  discipline: z.enum(disciplines),
  colour: hex,
  /** Portrait for the driver page and the person's place in it. */
  portrait: imageKey,
  portraitFocus: focus,
  /** With the car, the formula car or the bike, for the team page. */
  vehicle: imageKey,
  vehicleFocus: focus,
  stats: z.array(statSchema).length(4),
  /** Paddock photos for the fan, the driver's own first. */
  paddock: z.array(imageKey).length(5),
  helmets: z.array(helmetSchema).length(3),
});

export type Driver = z.infer<typeof driverSchema>;

const principalSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  country: z.string().length(2),
  portrait: imageKey,
  portraitFocus: focus,
  since: z.number().int(),
});

const teamSchema = z
  .object({
    drivers: z.array(driverSchema).length(3),
    principal: principalSchema,
  })
  .refine((t) => new Set(t.drivers.map((d) => d.slug)).size === t.drivers.length, {
    message: "Driver slugs must be unique",
  });

export const team = teamSchema.parse({
  drivers: [
    {
      slug: "21-wierzbicki",
      number: "21",
      key: "kuba",
      firstName: "Kuba",
      lastName: "Wierzbicki",
      country: "PL",
      discipline: "drift",
      colour: "#e3a04f",
      portrait: "team/kuba-face",
      portraitFocus: [0.52, 0.42],
      vehicle: "team/kuba-car",
      vehicleFocus: [0.53, 0.5],
      stats: [
        { key: "events", value: 42, format: "int" },
        { key: "wins", value: 6, format: "int" },
        { key: "titles", value: 3, format: "int" },
        { key: "bestRun", value: 98.5, format: "dec1", unit: "PTS" },
      ],
      paddock: [
        "paddock/kuba-wheel",
        "paddock/mechanics-wheel",
        "paddock/henrik-pitwall",
        "paddock/elena-helmet",
        "paddock/tomas-sandwich",
      ],
      helmets: [
        { slug: "asfalt", name: "Asfalt", year: 2024, image: "helmets/21-asfalt" },
        {
          slug: "wycinanka",
          name: "Wycinanka",
          year: 2025,
          image: "helmets/21-wycinanka",
          worn: "helmets/21-wycinanka-worn",
        },
        { slug: "night-shift", name: "Night Shift", year: 2026, image: "helmets/21-night-shift" },
      ],
    },
    {
      slug: "08-moreau",
      number: "08",
      key: "elena",
      firstName: "Elena",
      lastName: "Moreau",
      country: "FR",
      discipline: "formula",
      colour: "#d9573f",
      portrait: "team/elena-face",
      portraitFocus: [0.47, 0.45],
      vehicle: "team/elena-formula",
      vehicleFocus: [0.62, 0.5],
      stats: [
        { key: "starts", value: 38, format: "int" },
        { key: "poles", value: 7, format: "int" },
        { key: "wins", value: 4, format: "int" },
        { key: "bestLap", value: 72.408, format: "lap" },
      ],
      paddock: [
        "paddock/elena-helmet",
        "paddock/henrik-pitwall",
        "paddock/mechanics-wheel",
        "paddock/kuba-wheel",
        "paddock/tomas-sandwich",
      ],
      helmets: [
        { slug: "mirror", name: "Mirror", year: 2026, image: "helmets/08-mirror" },
        {
          slug: "atelier",
          name: "Atelier",
          year: 2025,
          image: "helmets/08-atelier",
          worn: "helmets/08-atelier-worn",
        },
        { slug: "topo", name: "Topo", year: 2024, image: "helmets/08-topo" },
      ],
    },
    {
      slug: "36-aranda",
      number: "36",
      key: "tomas",
      firstName: "Tomás",
      lastName: "Aranda",
      country: "ES",
      discipline: "moto",
      colour: "#8fb3d6",
      portrait: "team/tomas-face",
      portraitFocus: [0.44, 0.45],
      vehicle: "team/tomas-moto",
      vehicleFocus: [0.53, 0.5],
      stats: [
        { key: "starts", value: 61, format: "int" },
        { key: "podiums", value: 11, format: "int" },
        { key: "wins", value: 3, format: "int" },
        { key: "maxLean", value: 62, format: "int", unit: "°" },
      ],
      paddock: [
        "paddock/tomas-sandwich",
        "paddock/mechanics-wheel",
        "paddock/kuba-wheel",
        "paddock/henrik-pitwall",
        "paddock/elena-helmet",
      ],
      helmets: [
        {
          slug: "smoke",
          name: "Smoke",
          year: 2025,
          image: "helmets/36-smoke",
          worn: "helmets/36-smoke-worn",
        },
        { slug: "sol", name: "Sol", year: 2024, image: "helmets/36-sol" },
        { slug: "cuero", name: "Cuero", year: 2026, image: "helmets/36-cuero" },
      ],
    },
  ],
  principal: {
    firstName: "Henrik",
    lastName: "Sand",
    country: "SE",
    portrait: "team/henrik-face",
    portraitFocus: [0.52, 0.45],
    since: 2019,
  },
});

export function getDriver(slug: string): Driver | undefined {
  return team.drivers.find((d) => d.slug === slug);
}

/** Writes a stat value the way its counter ends: 42, 98.5, 1:12.408. */
export function formatStat(value: number, format: Stat["format"]): string {
  if (format === "int") return String(Math.round(value));
  if (format === "dec1") return value.toFixed(1);
  const ms = Math.round(value * 1000);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
