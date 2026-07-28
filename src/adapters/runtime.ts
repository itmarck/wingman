import { v7 as uuid } from 'uuid';
import type { Clock, IdGenerator } from '../system/runtime.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class UuidGenerator implements IdGenerator {
  generate(): string {
    return uuid();
  }
}
