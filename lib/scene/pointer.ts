import { sceneTuning } from "@/lib/scene-tuning";
import { damp, normalize, smoothstep, type Mat4, type Vec3 } from "./math";

const P = sceneTuning.pointer;

type Sample = {
  origin: Vec3;
  ray: Vec3;
  /** World displacement per metre along the ray, from the cursor's motion. */
  push: Vec3;
  strength: number;
  /** Last time it was refreshed (fades from here) and when it started following the cursor. */
  born: number;
  since: number;
  /** Where on screen this sample started; the head follows the cursor until it moves on. */
  from: [number, number];
  live: boolean;
};

function unproject(inverse: Mat4, x: number, y: number, z: number): Vec3 {
  const w = inverse[3] * x + inverse[7] * y + inverse[11] * z + inverse[15];
  return [
    (inverse[0] * x + inverse[4] * y + inverse[8] * z + inverse[12]) / w,
    (inverse[1] * x + inverse[5] * y + inverse[9] * z + inverse[13]) / w,
    (inverse[2] * x + inverse[6] * y + inverse[10] * z + inverse[14]) / w,
  ];
}

/**
 * The last few cursor rays in world space. The head follows the cursor; once it has moved on,
 * a sample freezes where it was and fades over `life`, so a stroke leaves a furrow in the dust
 * that closes up again. Strength grows with cursor speed; a resting cursor only parts the dust.
 */
export class PointerTrail {
  /** Uniform data: origin xyz + weight, ray xyz, push xyz (vec4 each, `trail` entries). */
  readonly origins = new Float32Array(P.trail * 4);
  readonly rays = new Float32Array(P.trail * 4);
  readonly pushes = new Float32Array(P.trail * 4);
  /** Whether any sample still has weight (lets the shaders skip the work). */
  any = false;

  private samples: Sample[] = [];
  private ndc: [number, number] = [0, 0];
  private last: [number, number] | null = null;
  private velocity: [number, number] = [0, 0];
  private active = false;

  set(x: number, y: number, active: boolean) {
    this.ndc = [x, y];
    this.active = active;
    if (!active) this.last = null;
  }

  clear() {
    this.samples = [];
    this.velocity = [0, 0];
    this.any = false;
    this.origins.fill(0);
  }

  update(t: number, dt: number, inverse: Mat4, view: Mat4, aspect: number, tanHalfFov: number) {
    // Cursor velocity in screen heights per second.
    let vx = 0;
    let vy = 0;
    if (this.active && this.last) {
      vx = ((this.ndc[0] - this.last[0]) * 0.5 * aspect) / dt;
      vy = ((this.ndc[1] - this.last[1]) * 0.5) / dt;
    }
    this.last = this.active ? [this.ndc[0], this.ndc[1]] : null;
    this.velocity = [damp(this.velocity[0], vx, P.speedDamping, dt), damp(this.velocity[1], vy, P.speedDamping, dt)];
    const speed = Math.hypot(this.velocity[0], this.velocity[1]);

    let head = this.samples[0];
    if (this.active) {
      const near = unproject(inverse, this.ndc[0], this.ndc[1], -1);
      const far = unproject(inverse, this.ndc[0], this.ndc[1], 1);
      // One screen height spans 2·tan(fov/2) metres at one metre along the ray.
      const span = 2 * tanHalfFov * P.pushTime;
      const push: Vec3 = [0, 1, 2].map(
        (k) => (view[k * 4] * this.velocity[0] + view[k * 4 + 1] * this.velocity[1]) * span,
      ) as Vec3;
      const moved = head ? Math.hypot(this.ndc[0] - head.from[0], this.ndc[1] - head.from[1]) : 0;
      if (!head || !head.live || (t - head.since >= P.spacing && moved > P.minMove)) {
        if (head) head.live = false;
        head = {
          origin: near,
          ray: [0, 0, -1],
          push,
          strength: 0,
          born: t,
          since: t,
          from: [this.ndc[0], this.ndc[1]],
          live: true,
        };
        this.samples.unshift(head);
        this.samples.length = Math.min(this.samples.length, P.trail);
      }
      head.origin = near;
      head.ray = normalize([far[0] - near[0], far[1] - near[1], far[2] - near[2]]);
      head.push = push;
      head.strength = Math.min(P.maxStrength, P.rest + P.speedGain * speed);
      head.born = t;
    } else if (head?.live) {
      head.live = false;
    }

    this.any = false;
    this.origins.fill(0);
    this.samples = this.samples.filter((s) => t - s.born < P.life);
    this.samples.forEach((s, i) => {
      const w = s.strength * (1 - smoothstep(0, P.life, t - s.born));
      this.origins.set([...s.origin, w], i * 4);
      this.rays.set([...s.ray, 0], i * 4);
      this.pushes.set([...s.push, 0], i * 4);
      if (w > 0) this.any = true;
    });
  }
}
