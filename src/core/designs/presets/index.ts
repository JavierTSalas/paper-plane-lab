import type { PlanePreset } from '../types';
import { basicGlider } from './basic-glider';
import { blackburnDart } from './blackburn-dart';
import { bulldogDart } from './bulldog-dart';
import { classicDart } from './classic-dart';
import { flyingWing } from './flying-wing';
import { harrier } from './harrier';
import { nakamuraLock } from './nakamura-lock';
import { skyKing } from './sky-king';
import { stable } from './stable';
import { suzanne } from './suzanne';
import { wideDart } from './wide-dart';

/** Every preset airplane, in hangar order. To add one: create a file next to this one and add it to this list. */
export const PRESET_LIST: PlanePreset[] = [
  classicDart,
  wideDart,
  bulldogDart,
  blackburnDart,
  harrier,
  nakamuraLock,
  stable,
  basicGlider,
  suzanne,
  skyKing,
  flyingWing,
];
