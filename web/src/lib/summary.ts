// One plain sentence that says what the grade means (spec: Report screen).

import type { FreeSummary } from './api';

export function summarySentence(s: Pick<FreeSummary, 'counts' | 'partial'>): string {
  const { critical, high, medium, low } = s.counts;
  const serious = critical + high;
  const total = serious + medium + low;
  const partial = s.partial ? ' Some checks could not finish, so this grade is partial.' : '';
  if (total === 0) return `We found no problems in the checks we ran.${partial}`;
  if (critical > 0) {
    return `${plural(critical, 'serious problem')} could let someone take over your app or your data. Fix ${critical === 1 ? 'it' : 'them'} first.${partial}`;
  }
  if (serious > 0) return `${plural(serious, 'important problem')} should be fixed soon.${partial}`;
  return `${plural(total, 'smaller problem')} to tidy up. Nothing urgent.${partial}`;
}

function plural(n: number, noun: string): string {
  const word = n === 1 ? 'One' : String(n);
  return `${word} ${noun}${n === 1 ? '' : 's'}`;
}
