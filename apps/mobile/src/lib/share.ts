import { Share } from 'react-native';

/**
 * Hand a confirmation to whoever the person wants to show it to.
 *
 * Deliberately silent on failure. Every platform has its own reasons for
 * declining — a dismissed sheet looks identical to an unsupported one — and
 * none of them are worth an error message over something the booking does not
 * depend on.
 */
export async function share(message: string): Promise<void> {
  try {
    await Share.share({ message });
  } catch {
    // Dismissed, or nowhere to share to.
  }
}
