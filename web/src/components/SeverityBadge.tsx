import { SEVERITY_ICON, SEVERITY_LABEL, type Severity } from '../lib/severity';

const STYLE: Record<Severity, string> = {
  critical: 'bg-critical-fill text-critical',
  high: 'bg-high-fill text-high',
  medium: 'bg-medium-fill text-medium',
  low: 'bg-low-fill text-low',
  info: 'bg-low-fill text-low',
};

/** Icon + word + colour: severity is never shown by colour alone. */
export function SeverityBadge({ severity, count }: { severity: Severity; count?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-13 font-semibold ${STYLE[severity]}`}
    >
      <span aria-hidden="true">{SEVERITY_ICON[severity]}</span>
      <span>
        {count === undefined
          ? SEVERITY_LABEL[severity]
          : `${String(count)} ${SEVERITY_LABEL[severity]}`}
      </span>
    </span>
  );
}
