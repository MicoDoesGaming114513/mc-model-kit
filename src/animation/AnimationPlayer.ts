import * as THREE from "three";
import type { BoneNode } from "../bedrock/buildModel";
import { bedrockQuaternion } from "../bedrock/buildModel";
import { AnimationDef, sampleChannel } from "./parseAnimation";
import type { MolangContext } from "./molang";

export interface PlayOptions {
  speed?: number;
  reset?: boolean;
}

export class AnimationPlayer {
  readonly bones: Map<string, BoneNode>;
  animations: Map<string, AnimationDef>;

  private current: AnimationDef | null = null;
  private currentName: string | null = null;
  private time = 0;
  private speed = 1;
  private paused = false;
  private lifeTime = 0;
  private lastDelta = 0;
  private readonly queries: MolangContext["queries"] = {
    anim_time: 0,
    life_time: 0,
    delta_time: 0,
    ground_speed: 0,
    vertical_speed: 0,
    is_on_ground: 1,
    health: 20,
    hurt_time: 0,
    position_x: 0,
    position_y: 0,
    position_z: 0,
    time_of_day: 6000,
    moon_phase: 0,
    is_sneaking: 0,
    is_sprinting: 0,
    is_swimming: 0,
    is_riding: 0,
    is_sleeping: 0,
  };

  constructor(bones: Map<string, BoneNode>, animations: Map<string, AnimationDef>) {
    this.bones = bones;
    this.animations = animations;
  }

  setAnimations(animations: Map<string, AnimationDef>): void {
    this.animations = animations;
    this.current = null;
    this.currentName = null;
    this.reset();
  }

  get animationName(): string | null {
    return this.currentName;
  }

  get animationTime(): number {
    return this.time;
  }

  get animationLength(): number {
    return this.current?.length ?? 0;
  }

  get isPlaying(): boolean {
    return this.current !== null && !this.paused;
  }

  play(name?: string | null, options: PlayOptions = {}): AnimationDef | null {
    if (!name) {
      this.current = null;
      this.currentName = null;
      this.reset();
      return null;
    }

    const def = this.findAnimation(name);
    if (!def) {
      throw new Error(`找不到动画 "${name}"`);
    }

    if (options.reset !== false) this.time = 0;
    this.current = def;
    this.currentName = def.name;
    this.speed = options.speed ?? 1;
    this.paused = false;
    return def;
  }

  findAnimation(name: string): AnimationDef | null {
    if (this.animations.has(name)) return this.animations.get(name)!;
    const direct = `animation.model.${name}`;
    if (this.animations.has(direct)) return this.animations.get(direct)!;
    const short = name.replace(/^animation\./, "");
    for (const [key, value] of this.animations) {
      if (key.replace(/^animation\./, "") === short) return value;
      if (key.endsWith(`.${name}`)) return value;
    }
    return null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  toggle(): void {
    this.paused = !this.paused;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0, speed);
  }

  update(deltaSeconds: number): void {
    this.lifeTime += deltaSeconds;
    this.lastDelta = deltaSeconds;
    if (!this.current || this.paused) return;

    this.time += deltaSeconds * this.speed;

    const length = this.current.length;
    if (length <= 0) {
      this.time = 0;
      return;
    }

    if (this.current.loop === true) {
      this.time = this.time % length;
      if (this.time < 0) this.time += length;
    } else if (this.current.loop === "hold") {
      this.time = Math.min(this.time, length);
    } else if (this.time > length) {
      this.time = length;
      this.paused = true;
    }
  }

  seek(seconds: number): void {
    if (!this.current) return;
    const length = this.current.length;
    if (length <= 0) {
      this.time = 0;
      return;
    }
    if (this.current.loop === true) {
      this.time = ((seconds % length) + length) % length;
    } else {
      this.time = Math.min(Math.max(0, seconds), length);
    }
  }

  /**
  * Poses every bone from the rest transform, then applies the active animation.
  * Call once per frame after update().
  */
  apply(): void {
    this.reset();

    if (!this.current) return;

    const time = this.time - (this.current.startDelay || 0);
    const context: MolangContext = {
      queries: {
        ...this.queries,
        anim_time: Math.max(0, time),
        life_time: this.lifeTime,
        delta_time: this.lastDelta,
      },
    };

    for (const [boneName, boneAnim] of this.current.bones) {
      const node = this.bones.get(boneName);
      if (!node) continue;

      if (boneAnim.position) {
        const value = sampleChannel(boneAnim.position, time, context);
        if (value) {
          node.group.position.set(
            node.basePosition.x + value[0],
            node.basePosition.y + value[1],
            node.basePosition.z + value[2],
          );
        }
      }

      if (boneAnim.rotation) {
        const value = sampleChannel(boneAnim.rotation, time, context);
        if (value) {
          bedrockQuaternion(value as [number, number, number], node.group.quaternion);
        }
      }

      if (boneAnim.scale) {
        const value = sampleChannel(boneAnim.scale, time, context);
        if (value) {
          node.group.scale.set(value[0], value[1], value[2]);
        }
      }
    }
  }

  reset(): void {
    for (const node of this.bones.values()) {
      node.group.position.copy(node.basePosition);
      node.group.quaternion.copy(node.baseQuaternion);
      node.group.scale.set(1, 1, 1);
    }
  }
}
