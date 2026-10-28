/**
 * Copy the invite link with graceful fallbacks.
 * navigator.clipboard & navigator.share only exist in secure contexts
 * (https or localhost) — over plain http://192.168.x.x on a phone they are
 * missing, which used to make the "Salin Link" button do nothing.
 */
export async function copyInviteLink(code) {
  const url = `${location.origin}${location.pathname}?room=${code}`;

  // Phones: offer the native share sheet (WhatsApp etc.).
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (coarse && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: `Remi Tongkrongan — Meja ${code}`, text: `Gabung ke meja remi ${code}`, url });
      return { ok: true, via: 'share' };
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, via: 'cancelled' };
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return { ok: true, via: 'clipboard', url };
    }
  } catch { /* fall through */ }

  // Last resort: legacy execCommand copy.
  try {
    const input = document.createElement('textarea');
    input.value = url;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(input);
    if (copied) return { ok: true, via: 'fallback', url };
  } catch { /* fall through */ }

  return { ok: false, via: 'unavailable', url };
}
