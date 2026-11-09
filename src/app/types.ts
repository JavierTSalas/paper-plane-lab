import type { Conditions, DiagnosisCode, FlightMetrics, Launch } from '../core/types';

/** What the app keeps of one flight. The full trajectory is re-simulated from `seed` when needed. */
export interface FlightSummary {
  id: string;
  planeId: string;
  /** Name at the time of the flight, so history survives renames and deletes. */
  planeName: string;
  envId: string;
  conditions: Conditions;
  launch: Launch;
  seed: number;
  metrics: FlightMetrics;
  diagnosisCodes: DiagnosisCode[];
  /** ISO 8601 timestamp. */
  at: string;
}

export type UnitsSetting = 'metric' | 'imperial';

export interface Settings {
  units: UnitsSetting;
  reducedMotion: boolean;
  showTrails: boolean;
}

export interface Profile {
  name: string;
  onboarded: boolean;
}
