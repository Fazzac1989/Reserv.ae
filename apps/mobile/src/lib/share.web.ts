/**
 * Sharing in a browser.
 *
 * React Native's Share opens a native sheet that a web page has no equivalent
 * of. Where the browser offers one — which on a phone it does — this is the
 * same gesture; where it does not, the text goes to the clipboard, because
 * "copied" is a real outcome and a dead button is not.
 */
export async function share(message: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text: message });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(message);
    }
  } catch {
    // Dismissed, blocked, or nowhere to share to.
  }
}
