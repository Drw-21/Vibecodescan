import type { Severity } from '../../supabase/functions/_shared/scanner/types.ts';
import type { Site } from '../site.ts';

/** One fixture page/site for one check, with the result the check must give. */
export interface CheckCase {
  name: string;
  site: Site;
  expect: 'pass' | 'fail' | 'incomplete';
  /** For "fail": the severity of every failing finding, in any order. */
  failSeverities?: Severity[];
  /** Text that must appear in the evidence of some failing finding. */
  evidence?: string[];
  /** Values that must never appear anywhere in the findings (e.g. a full secret). */
  mustNotLeak?: string[];
}
