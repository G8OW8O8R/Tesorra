import type { SceneTuning } from "@/lib/scene-tuning";
import { clamp } from "./math";
import type { Track } from "./track";

export type PhaseKind = "hero" | "travel" | "dwell" | "tail";

export type Phase = {
  kind: PhaseKind;
  /** Stop this phase leads to (travel) or sits at (dwell); −1 for hero/tail. */
  stop: number;
  /** Scroll progress range. */
  p0: number;
  p1: number;
  /** Camera distance range and slopes (distance per unit of progress) at both ends. */
  d0: number;
  d1: number;
  m0: number;
  m1: number;
};

export type Timeline = {
  /** Scroll length of the whole ride in chapters (multiply by the chapter height per device). */
  chapters: number;
  phases: Phase[];
  /** Camera distance along the track for scroll progress 0..1. */
  distanceAt(p: number): number;
  /** Phase containing p and the local progress inside it. */
  phaseAt(p: number): { phase: Phase; local: number };
  /** Scroll progress at the middle of each stop. */
  stopCentres: number[];
  /** Camera distance at the middle of each stop, and half the distance it crawls through it. */
  stopCameras: number[];
  stopHalves: number[];
};

/**
 * Ride between stops: easeInOutCubic over the distance, plus the two crawl speeds blended in at
 * the ends (Hermite slope terms), so it leaves one stop and reaches the next at their crawl.
 */
function rideCurve(d0: number, d1: number, m0: number, m1: number, span: number, t: number) {
  const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const t2 = t * t;
  const t3 = t2 * t;
  return d0 + (d1 - d0) * ease + span * (m0 * (t3 - 2 * t2 + t) + m1 * (t3 - t2));
}

/**
 * Scroll → camera distance. Each chapter is a quick ride into its stop and a long stretch at the
 * stop where the camera keeps crawling at a fraction of its average ride speed. Rides speed up and
 * brake smoothly and meet those crawls at both ends, so there is no jolt. The page itself always
 * scrolls at its own pace; only the camera slows.
 */
export function buildTimeline(track: Track, tuning: SceneTuning): Timeline {
  const s = tuning.scroll;
  const stopCameras = track.stops.map((stop) => stop.distance - tuning.stops[stop.id].view.back);
  const ride = 1 - s.stopShare;

  type Draft = Omit<Phase, "p0" | "p1" | "m0" | "m1"> & { units: number };
  const drafts: Draft[] = [{ kind: "hero", stop: -1, d0: 0, d1: s.heroDistance, units: s.hero }];
  const stopHalves: number[] = [];
  stopCameras.forEach((c, i) => {
    const from = drafts[drafts.length - 1].d1;
    // Crawl speed = `stopSpeed` × the ride's average speed:
    // 2h / stopShare = stopSpeed · (c − from − h) / ride  →  solve for the half-length h.
    const h = (s.stopSpeed * s.stopShare * (c - from)) / (2 * ride + s.stopSpeed * s.stopShare);
    stopHalves.push(h);
    drafts.push({ kind: "travel", stop: i, d0: from, d1: c - h, units: ride });
    drafts.push({ kind: "dwell", stop: i, d0: c - h, d1: c + h, units: s.stopShare });
  });
  const last = drafts[drafts.length - 1].d1;
  drafts.push({ kind: "tail", stop: -1, d0: last, d1: last + s.tailDistance, units: s.tail });

  const chapters = drafts.reduce((sum, d) => sum + d.units, 0);
  let cursor = 0;
  const phases: Phase[] = drafts.map(({ units, ...d }) => {
    const p0 = cursor / chapters;
    cursor += units;
    return { ...d, p0, p1: cursor / chapters, m0: 0, m1: 0 };
  });

  // Linear phases keep their own slope; rides inherit their neighbours' slopes.
  const linear = (ph: Phase) => (ph.d1 - ph.d0) / (ph.p1 - ph.p0);
  phases.forEach((ph, i) => {
    if (ph.kind !== "travel") {
      ph.m0 = ph.m1 = linear(ph);
      return;
    }
    ph.m0 = linear(phases[i - 1]);
    ph.m1 = linear(phases[i + 1]);
  });

  function phaseAt(p: number) {
    const q = clamp(p, 0, 1);
    const phase = phases.find((ph) => q <= ph.p1) ?? phases[phases.length - 1];
    return { phase, local: clamp((q - phase.p0) / (phase.p1 - phase.p0), 0, 1) };
  }

  function distanceAt(p: number) {
    const { phase, local } = phaseAt(p);
    if (phase.kind !== "travel") return phase.d0 + (phase.d1 - phase.d0) * local;
    return rideCurve(phase.d0, phase.d1, phase.m0, phase.m1, phase.p1 - phase.p0, local);
  }

  const dwells = phases.filter((ph) => ph.kind === "dwell");
  return {
    chapters,
    phases,
    distanceAt,
    phaseAt,
    stopCentres: dwells.map((ph) => (ph.p0 + ph.p1) / 2),
    stopCameras,
    stopHalves,
  };
}
