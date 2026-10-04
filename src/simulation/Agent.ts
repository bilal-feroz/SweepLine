/**
 * Agent state storage.
 *
 * Agents live in a fixed-capacity pool of typed arrays (structure-of-arrays)
 * so the engine can update thousands of jellyfish per frame without
 * allocation, and the renderer can read positions directly.
 */

export const S_INACTIVE = 0;
export const S_APPROACHING = 1;
export const S_GUIDED = 2;
export const S_UNDER_SKIRT = 3;
export const S_TRANSFER_QUEUE = 4;
export const S_TRANSFERRED = 5;
export const S_RELEASED = 6;
export const S_INTAKE_CONTACT = 7;
export const S_FREE_DRIFT = 8;

export const STATE_NAMES = [
  'INACTIVE',
  'APPROACHING',
  'GUIDED',
  'UNDER_SKIRT',
  'TRANSFER_QUEUE',
  'TRANSFERRED',
  'RELEASED',
  'INTAKE_CONTACT',
  'FREE_DRIFT',
] as const;

export type AgentStateName = (typeof STATE_NAMES)[number];

/** Flag bits. */
export const F_ENCOUNTERED = 1;
export const F_UNDER_COUNTED = 2;
export const F_OVERTOPPED = 4;
export const F_DIVERTED = 8;
export const F_REEF_RELEASED = 16;
export const F_RESOLVED = 32;
export const F_OVERTOPPING = 64;

export class AgentPool {
  readonly capacity: number;
  active = 0;

  readonly id: Int32Array;
  readonly state: Uint8Array;
  readonly flags: Uint8Array;
  readonly side: Int8Array;

  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;

  /** Bell diameter (m). */
  readonly size: Float32Array;
  /** Pulse phase offset 0..1. */
  readonly phase: Float32Array;
  /** Colour variation 0..1. */
  readonly tint: Float32Array;
  /** Standard-normal depth preference; preferred depth = mean + sd * depthZ. */
  readonly depthZ: Float32Array;
  readonly swimSpeed: Float32Array;
  readonly heading: Float32Array;

  readonly stateTime: Float32Array;
  /** Sim time of first curtain contact, or −1. */
  readonly contactStart: Float32Array;
  /** General-purpose countdown (transit time, impingement dwell, overtopping). */
  readonly timer: Float32Array;
  /** Position in the throat queue, or −1. */
  readonly queueIndex: Int16Array;
  /** Visual fade-in 0..1. */
  readonly fade: Float32Array;

  private readonly freeList: Int32Array;
  private freeTop: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.id = new Int32Array(capacity);
    this.state = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);
    this.side = new Int8Array(capacity);
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.phase = new Float32Array(capacity);
    this.tint = new Float32Array(capacity);
    this.depthZ = new Float32Array(capacity);
    this.swimSpeed = new Float32Array(capacity);
    this.heading = new Float32Array(capacity);
    this.stateTime = new Float32Array(capacity);
    this.contactStart = new Float32Array(capacity);
    this.timer = new Float32Array(capacity);
    this.queueIndex = new Int16Array(capacity);
    this.fade = new Float32Array(capacity);
    this.freeList = new Int32Array(capacity);
    this.freeTop = 0;
    this.clear();
  }

  clear(): void {
    this.state.fill(S_INACTIVE);
    this.flags.fill(0);
    this.queueIndex.fill(-1);
    this.active = 0;
    // Lowest slots are handed out first.
    for (let i = 0; i < this.capacity; i++) this.freeList[i] = this.capacity - 1 - i;
    this.freeTop = this.capacity;
  }

  alloc(): number {
    if (this.freeTop === 0) return -1;
    const slot = this.freeList[--this.freeTop];
    this.active++;
    return slot;
  }

  free(slot: number): void {
    if (this.state[slot] === S_INACTIVE) return;
    this.state[slot] = S_INACTIVE;
    this.flags[slot] = 0;
    this.queueIndex[slot] = -1;
    this.freeList[this.freeTop++] = slot;
    this.active--;
  }

  /** Slot currently holding agent `agentId`, or −1. */
  findById(agentId: number): number {
    const ids = this.id;
    const st = this.state;
    for (let i = 0; i < this.capacity; i++) if (st[i] !== S_INACTIVE && ids[i] === agentId) return i;
    return -1;
  }
}
