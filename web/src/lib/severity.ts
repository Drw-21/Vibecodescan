// Severity is never shown by colour alone: every badge has an icon shape and a word.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

/** Shapes differ per severity so they can be told apart without colour. */
export const SEVERITY_ICON: Record<Severity, string> = {
  critical: '⛔',
  high: '▲',
  medium: '◆',
  low: '●',
  info: 'ℹ',
};
