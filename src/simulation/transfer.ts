import { ASSUMPTIONS } from '../config/assumptions';
import type { ModuleStatus } from './types';

const T = ASSUMPTIONS.transfer;

export type TransferPath = 'PRIMARY' | 'STANDBY' | 'PASSIVE' | 'NONE';

/**
 * Large-aperture, low-shear transfer system (generic module — final hardware
 * to be selected through bell-damage testing).
 *
 * Primary path, optional standby path, and a residual passive open-flow line.
 * The standby path activates automatically on a primary fault — the first
 * fail-safe. If no powered path is available, SafeOpen is initiated.
 */
export class TransferState {
  primaryFault = false;
  standbyFault = false;
  standbyEnabled = true;
  /** Standby ramp 0..1 while activating. */
  standbyRamp = 0;
  /** Throat open = SweepLine is guiding and the transfer line is flowing. */
  throatOpen = false;
  /** Bellmouth gate: when false, the queue drains but no new arrivals are captured (SafeOpen throat clearing). */
  acceptingNew = true;
  /** Capacity setpoint 0..1. */
  capacityFraction = 0.8;
  /** Agents/s at 100 % capacity for the current agent budget. */
  designRate = 0.3;

  tokens = 0;
  /** FIFO of agent slots waiting in the bellmouth. */
  queue: number[] = [];
  /** Exponential moving averages (agents/s). */
  processedEMA = 0;
  arrivalEMA = 0;

  get primaryStatus(): ModuleStatus {
    if (this.primaryFault) return 'FAULT';
    return this.throatOpen ? 'ONLINE' : 'STANDBY';
  }

  get standbyStatus(): ModuleStatus {
    if (!this.standbyEnabled) return 'DISABLED';
    if (this.standbyFault) return 'FAULT';
    if (this.primaryFault && this.throatOpen) return this.standbyRamp >= 1 ? 'ONLINE' : 'ACTIVATING';
    return 'STANDBY';
  }

  /** True when at least one powered path can carry flow (or is about to). */
  get poweredPathAvailable(): boolean {
    if (!this.primaryFault) return true;
    return this.standbyEnabled && !this.standbyFault;
  }

  get activePath(): TransferPath {
    if (!this.throatOpen) return 'NONE';
    if (!this.primaryFault) return 'PRIMARY';
    if (this.standbyEnabled && !this.standbyFault && this.standbyRamp > 0.05) return 'STANDBY';
    if (T.passiveDrainFraction > 0) return 'PASSIVE';
    return 'NONE';
  }

  /** Available capacity as a fraction of design. */
  availability(): number {
    if (!this.throatOpen) return 0;
    const primary = this.primaryFault ? 0 : this.capacityFraction;
    const standby =
      this.primaryFault && this.standbyEnabled && !this.standbyFault ? this.capacityFraction * this.standbyRamp : 0;
    return Math.max(primary, standby, T.passiveDrainFraction);
  }

  capacityRate(): number {
    return this.designRate * this.availability();
  }

  /** Transfer water flow (m³/h) for display. */
  flowM3h(): number {
    return T.designFlowM3h * this.availability();
  }

  update(dt: number): void {
    const wantStandby = this.primaryFault && this.standbyEnabled && !this.standbyFault && this.throatOpen;
    if (wantStandby) this.standbyRamp = Math.min(1, this.standbyRamp + dt / T.standbyActivationTime);
    else this.standbyRamp = Math.max(0, this.standbyRamp - dt / 3);
  }

  reset(): void {
    this.primaryFault = false;
    this.standbyFault = false;
    this.standbyRamp = 0;
    this.throatOpen = false;
    this.acceptingNew = true;
    this.tokens = 0;
    this.queue.length = 0;
    this.processedEMA = 0;
    this.arrivalEMA = 0;
  }
}
