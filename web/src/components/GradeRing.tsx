// The hero of the report: the grade inside a ring that fills with the score.

const GRADE_COLOUR: Record<string, string> = {
  A: 'var(--pass)',
  B: 'var(--pass)',
  C: 'var(--medium)',
  D: 'var(--high)',
  F: 'var(--critical)',
};

const GRADE_WORD: Record<string, string> = {
  A: 'Looking good',
  B: 'Mostly fine',
  C: 'Needs work',
  D: 'At risk',
  F: 'Unsafe',
};

export function GradeRing({
  grade,
  score,
  partial,
}: {
  grade: string;
  score: number;
  partial?: boolean;
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const label = `Grade ${grade}, ${GRADE_WORD[grade] ?? ''}. Score ${String(score)} out of 100${partial ? ', partial' : ''}.`;
  return (
    <figure className="m-0 flex flex-col items-center gap-2" aria-label={label} role="img">
      <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--separator)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={GRADE_COLOUR[grade] ?? 'var(--low)'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${String(filled)} ${String(circumference)}`}
          transform="rotate(-90 70 70)"
        />
        <text
          x="70"
          y="70"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="52"
          fontWeight="700"
          fill="var(--text)"
        >
          {grade}
        </text>
      </svg>
      <figcaption className="text-15 text-secondary" aria-hidden="true">
        {GRADE_WORD[grade]} · {score}/100{partial ? ' · partial' : ''}
      </figcaption>
    </figure>
  );
}
