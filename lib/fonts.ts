import { Hubot_Sans, Instrument_Serif, Mona_Sans } from "next/font/google";
import localFont from "next/font/local";

/** Headings, names and product names: wide, heavy, italic (wdth 125, wght 900). */
export const display = Hubot_Sans({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  style: ["italic"],
  variable: "--font-hubot",
  display: "swap",
});

/** Text and interface. */
export const sans = Mona_Sans({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-mona",
  display: "swap",
  preload: false,
});

/**
 * Data, the dashboard, countdowns, labels, dates and prices, at small and medium sizes only (the
 * LIVE countdown is the one big use). Subset to Latin and Latin Extended. The family takes the
 * export's name.
 */
export const departureMono = localFont({
  src: "../app/fonts/DepartureMono-Regular.woff2",
  weight: "400",
  variable: "--font-departure",
  display: "swap",
});

/** Driver quotes. */
export const quote = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["italic"],
  variable: "--font-instrument",
  display: "swap",
  preload: false,
});

export const fontVariables = `${display.variable} ${sans.variable} ${departureMono.variable} ${quote.variable}`;
