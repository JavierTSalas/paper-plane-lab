import type { PlaneBuild } from '../../app/hooks';
import type { Conditions, Environment, FlightResult, Launch } from '../../core/types';

/** One throw on the Fly screen: everything needed to replay, log and explain it. */
export interface ThrowRecord {
  id: string;
  result: FlightResult;
  launch: Launch;
  conditions: Conditions;
  seed: number;
  env: Environment;
  build: PlaneBuild;
}
