/** Flight lab: the 3D stage and throw controls, reusable by other screens (onboarding). */
export { FlightStage } from './stage/FlightStage';
export type { FlightStageHandle, FlightStagePlane, FlightStageProps } from './stage/FlightStage';
/** The imperative three.js engine. Importing it pulls three.js into the importer's chunk; prefer <FlightStage/>. */
export { FlightStageEngine, isWebGL2Available } from './stage/FlightStageEngine';
export type { FlightStageOptions } from './stage/FlightStageEngine';
export { CAMERA_MODES } from './stage/cameraRig';
export type { CameraMode } from './stage/cameraRig';
export type { LiveSample } from './stage/playback';
export { ThrowPad } from './ThrowPad';
export type { ThrowPadProps } from './ThrowPad';
export { armStrength, ARM_LABEL, beaufort, nextSeed, swipeToThrow, trailOf, windDirectionLabel } from './flight';
