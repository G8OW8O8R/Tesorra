import { describe, expect, it } from "vitest";
import { cameraPose, carPose, carPosition, getRide, stillFrame } from "@/lib/scene/choreography";
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
      const eye = cameraPose(ride, p, { centre, d: pose.d, u: pose.u }).eye;
      expect(length(sub(eye, centre))).toBeGreaterThan(4);
    }
  });
});
