/** Messages between a driver page and its light dust scene (in a worker or on the main thread). */

export type PortraitOptions = {
  /** Drawing buffer size in device pixels. */
  width: number;
  height: number;
  dpr: number;
  mobile: boolean;
  reducedMotion: boolean;
  /** Page URL the photo paths are resolved against. */
  baseUrl: string;
  /** Starting colour of the dust, 0..1 sRGB. */
  colour: [number, number, number];
};

/**
 * A portrait as the page shows it: the image, where its box is (shares of the viewport: left, top,
 * right, bottom), the part of the image the box shows (object-fit: cover: u0, v0, u1, v1) and the
 * soft oval it is masked to (shares of the box: centre x, y, radius x, y).
 */
export type PortraitPhoto = {
  url: string;
  rect: [number, number, number, number];
  crop: [number, number, number, number];
  mask: [number, number, number, number];
};

export type PortraitStatus = "loading" | "ready" | "unsupported" | "error";

export type PortraitEvent =
  | { type: "status"; status: Exclude<PortraitStatus, "loading">; message?: string }
  /** The grains took the old photo's place (`start`) and settled as the new one (`end`). */
  | { type: "morph"; stage: "start" | "end" };

export type PortraitMessage =
  | { type: "init"; canvas: OffscreenCanvas; options: PortraitOptions }
  | { type: "resize"; width: number; height: number; dpr: number }
  | { type: "colour"; rgb: [number, number, number]; snap?: boolean }
  /** Every portrait the page can switch between, by index; images load as they arrive. */
  | { type: "photos"; photos: PortraitPhoto[] }
  /** Photo `from` falls apart into dust and settles as photo `to`. */
  | { type: "morph"; from: number; to: number }
  /** Cursor in normalised device coordinates. */
  | { type: "pointer"; x: number; y: number }
  | { type: "reducedMotion"; value: boolean }
  | { type: "visible"; value: boolean }
  | { type: "dispose" };
