import { appSite } from '../sites.ts';
import type { CheckCase } from './types.ts';

export const cases: CheckCase[] = [
  {
    name: 'always reports what it found, never fails',
    site: appSite(),
    expect: 'pass',
  },
];
