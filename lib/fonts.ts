import { Fraunces, Geist_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";

export const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

/** Display headings: the face closest to the wordmark (heavy italic, sharp serifs). */
export const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  axes: ["opsz", "SOFT"],
  style: ["italic"],
  variable: "--font-fraunces",
  display: "swap",
});

export const sans = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-schibsted",
  display: "swap",
});

export const mono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const fontVariables = `${serif.variable} ${display.variable} ${sans.variable} ${mono.variable}`;
