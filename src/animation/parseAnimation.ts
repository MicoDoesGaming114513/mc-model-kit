import { evaluateMolangValue, MolangContext } from "./molang";

export type MolangValue = number | string;
export type Triple = [MolangValue, MolangValue, MolangValue];
export type Vec3Numbers = [number, number, number];

export type LerpMode = "linear" | "catmullrom" | "step";

export interface Keyframe {
  time: number;
  pre: Triple;
  post: Triple;
  lerp: LerpMode;
}

export interface Channel {
  keyframes: Keyframe[];
}

export interface BoneAnimation {
  rotation?: Channel;
  position?: Channel;
  scale?: Channel;
}

export interface AnimationDef {
  name: string;
  length: number;
  loop: boolean | "hold";
  bones: Map<string, BoneAnimation>;
  startDelay: number;
}

function isKeyframeObject(raw: any): boolean {
  return (
    raw &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    ("pre" in raw || "post" in raw || "lerp_mode" in raw)
  );
}

function parseTriple(raw: any, mode: "rotation" | "position" | "scale"): Triple | null {
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) {
    return [raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0] as Triple;
  }
  if (typeof raw === "object") {
    return [raw.x ?? 0, raw.y ?? 0, raw.z ?? 0] as Triple;
  }
  if (typeof raw === "number" || typeof raw === "string") {
    return mode === "scale" ? [raw, raw, raw] : [raw, 0, 0];
  }
  return null;
}

function parseChannel(raw: any, mode: "rotation" | "position" | "scale"): Channel | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const keyframes: Keyframe[] = [];

  for (const [timeKey, value] of Object.entries(raw)) {
    const time = Number(timeKey);
    if (!Number.isFinite(time)) continue;

    let pre: Triple | null = null;
    let post: Triple | null = null;
    let lerp: LerpMode = "linear";

    if (isKeyframeObject(value)) {
      const anyValue = value as any;
      if (anyValue.lerp_mode === "catmullrom" || anyValue.lerp_mode === "step") {
        lerp = anyValue.lerp_mode;
      }
      pre = parseTriple(anyValue.pre, mode);
      post = parseTriple(anyValue.post, mode);
      if (!pre && post) pre = [...post] as Triple;
      if (!post && pre) post = [...pre] as Triple;
    } else {
      const triple = parseTriple(value, mode);
      pre = triple;
      post = triple ? ([...triple] as Triple) : null;
    }

    if (!pre || !post) continue;
    keyframes.push({ time, pre, post, lerp });
  }

  if (keyframes.length === 0) return undefined;
  keyframes.sort((a, b) => a.time - b.time);
  return { keyframes };
}

export function parseAnimations(json: any): Map<string, AnimationDef> {
  const result = new Map<string, AnimationDef>();
  const animations = json?.animations;
  if (!animations || typeof animations !== "object") return result;

  for (const [name, raw] of Object.entries<any>(animations)) {
    if (!raw || typeof raw !== "object") continue;
    const bones = new Map<string, BoneAnimation>();
    let maxTime = 0;

    if (raw.bones && typeof raw.bones === "object") {
      for (const [boneName, boneRaw] of Object.entries<any>(raw.bones)) {
        if (!boneRaw || typeof boneRaw !== "object") continue;
        const bone: BoneAnimation = {};
        bone.rotation = parseChannel(boneRaw.rotation, "rotation");
        bone.position = parseChannel(boneRaw.position, "position");
        bone.scale = parseChannel(boneRaw.scale, "scale");

        for (const channel of [bone.rotation, bone.position, bone.scale]) {
          if (!channel) continue;
          maxTime = Math.max(maxTime, channel.keyframes[channel.keyframes.length - 1].time);
        }

        if (bone.rotation || bone.position || bone.scale) bones.set(boneName, bone);
      }
    }

    const length = Number(raw.animation_length);
    const finalLength = Number.isFinite(length) && length > 0 ? length : maxTime;
    const loop = raw.loop === true ? true : raw.loop === "hold_on_last_frame" ? "hold" : false;

    result.set(name, {
      name,
      length: finalLength,
      loop,
      bones,
      startDelay: Number(raw.start_delay) || 0,
    });
  }

  return result;
}

function evaluateTriple(triple: Triple, context: MolangContext): Vec3Numbers {
  return [
    evaluateMolangValue(triple[0], context),
    evaluateMolangValue(triple[1], context),
    evaluateMolangValue(triple[2], context),
  ];
}

function lerpVec(a: Vec3Numbers, b: Vec3Numbers, t: number): Vec3Numbers {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function catmullRom(
  p0: Vec3Numbers,
  p1: Vec3Numbers,
  p2: Vec3Numbers,
  p3: Vec3Numbers,
  t: number,
): Vec3Numbers {
  const t2 = t * t;
  const t3 = t2 * t;
  const out: Vec3Numbers = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    out[i] =
      0.5 *
      (2 * p1[i] +
        (-p0[i] + p2[i]) * t +
        (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
        (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3);
  }
  return out;
}

export function sampleChannel(
  channel: Channel,
  time: number,
  context: MolangContext,
): Vec3Numbers | null {
  const keys = channel.keyframes;
  if (keys.length === 0) return null;
  if (keys.length === 1) return evaluateTriple(keys[0].post, context);

  if (time <= keys[0].time) {
    return evaluateTriple(keys[0].post, context);
  }
  const last = keys[keys.length - 1];
  if (time >= last.time) {
    return evaluateTriple(last.post, context);
  }

  let index = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    if (time >= keys[i].time && time < keys[i + 1].time) {
      index = i;
      break;
    }
  }

  const current = keys[index];
  const next = keys[index + 1];
  const span = next.time - current.time;
  const alpha = span <= 0 ? 1 : (time - current.time) / span;

  const v0 = evaluateTriple(current.post, context);
  const v1 = evaluateTriple(next.pre, context);

  if (current.lerp === "step") return v0;

  if (current.lerp === "catmullrom" && keys.length >= 3) {
    const prev = keys[Math.max(0, index - 1)];
    const after = keys[Math.min(keys.length - 1, index + 2)];
    const p0 = evaluateTriple(prev.post, context);
    const p3 = evaluateTriple(after.pre, context);
    return catmullRom(p0, v0, v1, p3, alpha);
  }

  return lerpVec(v0, v1, alpha);
}
