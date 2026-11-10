// A second tap at the just-dismissed control must not hit the screen beneath it.
// Keep navigation immediate and leave the rest of the screen interactive.
export function guardDismissClick(event) {
  if (!event || !event.detail || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
  const doc = event.currentTarget?.ownerDocument || globalThis.document;
  if (!doc?.body) return;
  event.stopPropagation();
  const guard = doc.createElement('div');
  guard.setAttribute('aria-hidden', 'true');
  guard.className = 'dismiss-click-guard';
  Object.assign(guard.style, {
    position: 'fixed', left: `${event.clientX - 48}px`, top: `${event.clientY - 48}px`,
    width: '96px', height: '96px', zIndex: '2147483647', background: 'transparent', touchAction: 'none',
  });
  for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick']) {
    guard.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); });
  }
  doc.body.appendChild(guard);
  setTimeout(() => guard.remove(), 350);
}
