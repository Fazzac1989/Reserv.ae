import { cn } from '../../lib/utils';

/**
 * A number against the target it is meant to hit.
 *
 * Every metric on this page has a threshold from the build plan, so showing the
 * number alone would make the reader do the comparison in their head. The
 * sample size sits next to it because "60%" from five requests is not a result.
 */

export interface TargetProps {
  label: string;
  value: number | null;
  /** Rendered after the value: '%', 'min', or nothing. */
  unit?: string;
  target: number;
  /** Whether hitting the target means being above it or below it. */
  direction: 'above' | 'below';
  /** How many observations the value is based on. */
  sample: number;
  /** Below this, the number is shown but not judged. */
  minSample?: number;
  detail?: string;
}

const MIN_SAMPLE_DEFAULT = 10;

export function Target({
  label,
  value,
  unit = '',
  target,
  direction,
  sample,
  minSample = MIN_SAMPLE_DEFAULT,
  detail,
}: TargetProps) {
  const hasValue = value !== null && Number.isFinite(value);
  const enoughData = sample >= minSample;
  const met = hasValue && (direction === 'above' ? value >= target : value <= target);

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>

      <p className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-2xl font-medium tabular-nums',
            // Only coloured once there is enough data to mean anything.
            enoughData && hasValue
              ? met
                ? 'text-foreground'
                : 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {hasValue ? value : '—'}
          {hasValue ? unit : ''}
        </span>
        <span className="text-sm text-muted-foreground">
          {direction === 'above' ? '≥' : '≤'} {target}
          {unit}
        </span>
      </p>

      <p className="text-xs text-muted-foreground">
        {!enoughData ? (
          <span>
            {sample} so far — too few to judge (needs {minSample})
          </span>
        ) : (
          <span>{detail ?? `from ${sample}`}</span>
        )}
      </p>
    </div>
  );
}
