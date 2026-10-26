import { z } from "zod";

const modelSchema = z.object({
  /** Key into `credits.models` in messages. */
  key: z.enum(["car", "formula", "moto", "helmet"]),
  file: z.string().regex(/^\/models\/[a-z-]+\.f32$/),
  author: z.string().min(1),
  license: z.string().min(1),
  url: z.url(),
});

const fontSchema = z.object({
  name: z.string().min(1),
  author: z.string().min(1),
  license: z.literal("SIL Open Font License 1.1"),
  url: z.url(),
  /** Licence text shipped with the site. */
  file: z.string().regex(/^\/fonts\/LICENSES\/[A-Za-z]+-OFL\.txt$/),
});

/** 3D models turned into the point clouds of the home page; CC BY needs the author named. */
export const models = z.array(modelSchema).parse([
  {
    key: "car",
    file: "/models/drift-car.f32",
    author: "kevin",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/nissan-silvia-s15-lbwk-super-silhouette-faa3ea6d43f14cec93eda98963bf9a5f",
  },
  {
    key: "formula",
    file: "/models/formula.f32",
    author: "Grow Solutions",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/formula-f1-car-racing-car-7d8e36feafc8446f9031f0c587dae4c4",
  },
  {
    key: "moto",
    file: "/models/moto.f32",
    author: "killuacraft164",
    license: "CGTrader Royalty Free",
    url: "https://www.cgtrader.com/free-3d-models/sports/game/low-poly-and-mid-poly-sport-motorcycle-3d-model-game-ready-asset",
  },
  {
    key: "helmet",
    file: "/models/helmet.f32",
    author: "MizuCorp",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/racing-helmet-b92c1426837e47778db2487f2c2d7121",
  },
]);

export const fonts = z.array(fontSchema).parse([
  {
    name: "Hubot Sans",
    author: "GitHub",
    license: "SIL Open Font License 1.1",
    url: "https://github.com/github/hubot-sans",
    file: "/fonts/LICENSES/HubotSans-OFL.txt",
  },
  {
    name: "Mona Sans",
    author: "GitHub",
    license: "SIL Open Font License 1.1",
    url: "https://github.com/github/mona-sans",
    file: "/fonts/LICENSES/MonaSans-OFL.txt",
  },
  {
    name: "Departure Mono",
    author: "Helena Zhang",
    license: "SIL Open Font License 1.1",
    url: "https://departuremono.com",
    file: "/fonts/LICENSES/DepartureMono-OFL.txt",
  },
  {
    name: "Instrument Serif",
    author: "Instrument",
    license: "SIL Open Font License 1.1",
    url: "https://github.com/Instrument/instrument-serif",
    file: "/fonts/LICENSES/InstrumentSerif-OFL.txt",
  },
]);
