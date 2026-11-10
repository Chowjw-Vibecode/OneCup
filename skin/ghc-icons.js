// GHC (group-head controller) artwork is shared with the physical buttons.
// This is a hint, never a click target or a machine command.
export function setGroupHeadHint(element, message, action = null) {
  if (!element) return;
  const symbol = { brew: 'i-cup', steam: 'i-steam', water: 'i-drop' }[action];
  element.classList.toggle('ghc-start-hint', Boolean(message && symbol));
  element.replaceChildren();
  if (message && symbol) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ghc-button-icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${symbol}`);
    svg.append(use);
    element.append(svg);
  }
  const label = document.createElement('span');
  label.textContent = message;
  element.append(label);
}
