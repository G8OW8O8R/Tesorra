import { describe, expect, it } from "vitest";
import {
  bodyPoses,
  cameraPose,
  carPose,
  carPosition,
  chapterAt,
  getRide,
  nearLive,
  startLights,
  stillFrame,
  storeProducts,
} from "@/lib/scene/choreography";
import { dot, length, sub } from "@/lib/scene/math";
import { sceneTuning } from "@/lib/scene-tuning";

const ride = getRide();
const { track, timeline } = ride;

describe("track", () => {
  it("has every chapter stop in order along the circuit", () => {
    expect(track.stops.map((s) => s.id)).toEqual(Object.keys(sceneTuning.stops));
    for (let i = 1; i < track.stops.length; i++) {
      expect(track.stops[i].distance).toBeGreaterThan(track.stops[i - 1].distance);
    }
    expect(track.stops.at(-1)!.distance).toBeLessThan(track.length);
  });

  it("gives unit tangents with a horizontal side vector at right angles", () => {
    for (let d = -10; d < track.length + 10; d += 7.3) {
      const f = track.frame(d);
      expect(length(f.tangent)).toBeCloseTo(1, 5);
      expect(Math.abs(dot(f.tangent, f.side))).toBeLessThan(0.05);
      expect(f.side[1]).toBe(0);
    }
  });

  it("turns the way the segments say at the apexes", () => {
    for (const stop of track.stops.filter((s) => s.turn !== 0)) {
      expect(Math.sign(track.curvature(stop.distance))).toBe(stop.turn);
    }
  });
});

describe("timeline", () => {
  it("never moves the camera backwards and starts at the grid", () => {
    expect(timeline.distanceAt(0)).toBe(0);
    let last = -Infinity;
    for (let i = 0; i <= 4000; i++) {
      const d = timeline.distanceAt(i / 4000);
      expect(d).toBeGreaterThanOrEqual(last - 1e-9);
      last = d;
    }
  });

  it("parks the camera at each stop's framing", () => {
    timeline.stopCentres.forEach((p, i) => {
      expect(timeline.distanceAt(p)).toBeCloseTo(timeline.stopCameras[i], 5);
    });
  });

  it("snaps reduced-motion frames to the grid or a stop", () => {
    expect(stillFrame(ride, 0.01)).toBe(0);
    expect(stillFrame(ride, timeline.stopCentres[2] + 0.001)).toBe(timeline.stopCentres[2]);
  });
});

describe("drift car", () => {
  it("moves without jumps across every phase boundary", () => {
    let prev = carPose(ride, 0);
    for (let i = 1; i <= 6000; i++) {
      const pose = carPose(ride, i / 6000);
      if (pose.form > 0 && prev.form > 0) {
        expect(Math.abs(pose.d - prev.d)).toBeLessThan(1.5);
        expect(Math.abs(pose.u - prev.u)).toBeLessThan(0.3);
        expect(Math.abs(pose.yaw - prev.yaw)).toBeLessThan(0.15);
      }
      prev = pose;
    }
  });

  it("never has the camera inside it", () => {
    for (let i = 0; i <= 4000; i++) {
      const p = i / 4000;
      const pose = carPose(ride, p);
      if (pose.form <= 0) continue;
      const centre = carPosition(ride, pose);
      const eye = cameraPose(ride, p, { drift: { centre, d: pose.d, u: pose.u } }).eye;
      expect(length(sub(eye, centre))).toBeGreaterThan(4);
    }
  });
});

describe("later stops", () => {
  const moving = ["formula", "moto"] as const;

  it("moves the formula car and the bike without jumps", () => {
    for (const id of moving) {
      let prev = bodyPoses(ride, 0)[id];
      for (let i = 1; i <= 6000; i++) {
        const pose = bodyPoses(ride, i / 6000)[id];
        if (pose.form > 0 && prev.form > 0) {
          expect(Math.abs(pose.d - prev.d)).toBeLessThan(1.5);
          expect(Math.abs(pose.u - prev.u)).toBeLessThan(0.3);
          expect(Math.abs(pose.roll - prev.roll)).toBeLessThan(0.15);
        }
        prev = pose;
      }
    }
  });

  it("keeps the lens clear of every body", () => {
    for (let i = 0; i <= 4000; i++) {
      const p = i / 4000;
      const poses = bodyPoses(ride, p);
      const mark = (id: "car" | "formula" | "moto") => ({
        centre: carPosition(ride, poses[id]),
        d: poses[id].d,
        u: poses[id].u,
      });
      const marks = { drift: mark("car"), formula: mark("formula"), moto: mark("moto") };
      for (const portrait of [0, 1]) {
        const eye = cameraPose(ride, p, marks, portrait).eye;
        for (const id of ["formula", "moto", "gantry"] as const) {
          const pose = poses[id];
          if (pose.form <= 0) continue;
          const at = carPosition(ride, pose);
          expect(length(sub(eye, at))).toBeGreaterThan(2.5);
        }
      }
    }
  });

  it("shows each vehicle at its own stop", () => {
    const at = (id: "formula" | "moto", stop: number) => bodyPoses(ride, timeline.stopCentres[stop])[id].form;
    expect(at("formula", 1)).toBe(1);
    expect(at("moto", 2)).toBe(1);
    expect(at("formula", 3)).toBe(0);
    expect(at("moto", 0)).toBe(0);
  });

  it("leans the bike into the corner at its stop", () => {
    const stop = track.stops[2];
    const pose = bodyPoses(ride, timeline.stopCentres[2]).moto;
    expect(Math.sign(pose.roll)).toBe(stop.turn);
    expect(Math.abs(pose.roll)).toBeGreaterThan(0.6);
  });

  it("brings the formula car to a stand in frame by the end of its stop", () => {
    const end = timeline.stopCentres[1] + 0.1 / timeline.chapters;
    const a = bodyPoses(ride, end).formula;
    const b = bodyPoses(ride, end + 0.005 / timeline.chapters).formula;
    expect(a.form).toBe(1);
    expect(Math.abs(b.d - a.d)).toBeLessThan(1e-6);
  });

  it("floats the store products only around the store stop", () => {
    const at = (q: number) => storeProducts(ride, timeline.stopCentres[3] + q / timeline.chapters);
    expect(at(-0.6).every((item) => item.form === 0)).toBe(true);
    expect(at(0).every((item) => item.form === 1)).toBe(true);
    expect(at(0.6).every((item) => item.form === 0)).toBe(true);
    expect(storeProducts(ride, timeline.stopCentres[2]).every((item) => item.form === 0)).toBe(true);
  });

  it("lights the start lights one by one near the live stop and keeps them lit", () => {
    const step = sceneTuning.live.lightStep;
    expect(startLights(ride, 0)).toEqual([0, 0, 0, 0, 0]);
    const counts = [1, 2, 3, 4, 5].map((n) => startLights(ride, (n + 0.5) * step).filter((v) => v === 1).length);
    expect(counts).toEqual([1, 2, 3, 4, 5]);
    expect(startLights(ride, 60).every((v) => v === 1)).toBe(true);
    expect(nearLive(ride, timeline.stopCentres[4])).toBe(true);
    expect(nearLive(ride, timeline.stopCentres[3])).toBe(false);
  });

  it("switches the current chapter halfway through each ride", () => {
    expect(chapterAt(ride, 0)).toBe(0);
    timeline.stopCentres.forEach((c, i) => expect(chapterAt(ride, c)).toBe(i));
    expect(chapterAt(ride, 1)).toBe(4);
  });
});
