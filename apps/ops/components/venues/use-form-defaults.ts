import type { ActionResult } from '../../lib/venues/actions';

/**
 * Rebuilds a form's default values after a failed submission.
 *
 * React resets an uncontrolled form once its action settles, so the defaults
 * have to come from somewhere that survives the round trip. On failure that is
 * what the operator typed; otherwise it is the stored row.
 */
export function formDefaults(state: ActionResult | null) {
  const prior = state && !state.ok ? (state.values ?? null) : null;

  return {
    /** Text, number and select fields. */
    text(name: string, stored: string | number | null | undefined): string | number {
      if (prior) return prior[name] ?? '';
      return stored ?? '';
    },
    /**
     * Checkboxes. An unchecked box submits nothing, so after a failure the
     * absence of a key means false — not "fall back to stored".
     */
    checked(name: string, stored: boolean): boolean {
      if (prior) return prior[name] === 'on';
      return stored;
    },
  };
}
