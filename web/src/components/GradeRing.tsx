// The hero of the report: the grade inside a thin ring that fills with the score.
// Severity colours are reserved for severity (spec), so the ring uses the accent colour and
// the grade's meaning is carried by the letter and its word.

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
  size = 168,
}: {
  grade: string;
  score: number;
  partial?: boolean;
  size?: number;
}) {
  const stroke = 10;
  const radius = 70 - stroke;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const label = `Grade ${grade}, ${GRADE_WORD[grade] ?? ''}. Score ${String(score)} out of 100${partial ? ', partial' : ''}.`;
  return (
    <figure className="flex flex-col items-center gap-3" aria-label={label} role="img">
      <svg width={size} height={size} viewBox="0 0 140 140" aria-hidden="true">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--separator)"
          strokeWidth={stroke}
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${String(filled)} ${String(circumference)}`}
          transform="rotate(-90 70 70)"
        />
        <text
          x="70"
          y="64"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="46"
          fontWeight="700"
          fill="var(--text)"
        >
          {grade}
        </text>
        <text
          x="70"
          y="96"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="13"
          fill="var(--text-secondary)"
        >
          {score}/100
        </text>
      </svg>
      <figcaption className="text-15 font-medium text-secondary" aria-hidden="true">
        {GRADE_WORD[grade]}
        {partial ? ' · partial' : ''}
      </figcaption>
    </figure>
  );
}
