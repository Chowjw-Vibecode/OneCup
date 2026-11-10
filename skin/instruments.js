// Real telemetry only: animate the pointer, never the numeric reading.
let nextDialId = 0;
const pointerStates = new WeakMap();

// Keep one animation per hand. Only its presentation is interpolated; the
// numeric readout, targets and recorded telemetry retain the latest sample.
function movePointer(hand, angle, view, reset) {
  let state = pointerStates.get(hand);
  if (!state) {
    state = { shown: null, target: null, frame: null, revision: 0, cancel: null };
    pointerStates.set(hand, state);
  }
  const stop = () => {
    if (state.frame !== null) state.cancel?.(state.frame);
    state.frame = null;
    state.revision++;
  };
  const reduced = () => typeof view.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = typeof view.requestAnimationFrame === 'function' && typeof view.cancelAnimationFrame === 'function';
  const place = value => { state.shown = value; hand.style.transform = `rotate(${value}deg)`; };
  hand.style.transition = 'none';
  if (angle === null || hand.isConnected === false) {
    stop();
    state.shown = state.target = null;
    return;
  }
  state.target = angle;
  if (reset || state.shown === null || reduced() || !canAnimate) {
    stop();
    place(angle);
    return;
  }
  if (state.frame !== null || state.shown === angle) return;
  state.cancel = id => view.cancelAnimationFrame(id);
  const revision = state.revision;
  let previous = view.performance?.now?.() ?? null;
  const tick = now => {
    if (revision !== state.revision) return;
    state.frame = null;
    if (hand.isConnected === false) {
      state.shown = state.target = null;
      return;
    }
    if (reduced()) { place(state.target); return; }
    const dt = previous === null ? 16 : Math.max(0, Math.min(40, now - previous));
    previous = now;
    const next = state.shown + (state.target - state.shown) * (1 - Math.exp(-dt / 95));
    if (Math.abs(state.target - next) <= .015) { place(state.target); return; }
    place(next);
    state.frame = view.requestAnimationFrame(tick);
  };
  state.frame = view.requestAnimationFrame(tick);
}
const numeric = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const escapeText = (value) => String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const point = (angle, radius) => {
  const radians = (angle - 90) * Math.PI / 180;
  return [110 + radius * Math.cos(radians), 110 + radius * Math.sin(radians)];
};
const arc = (start, end, radius) => `M${point(start, radius)}A${radius},${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end, radius)}`;
const defaultFormat = (value, digits = 1) => value === null ? '—' : value.toFixed(digits);

export function gaugeAngle(value, min, max) {
  const v = numeric(value), low = numeric(min), high = numeric(max);
  if (v === null || low === null || high === null || !(high > low) || !Number.isFinite(high - low)) return null;
  return -135 + 270 * Math.max(0, Math.min(1, (v - low) / (high - low)));
}

export function gaugeSpec(step = {}, kind) {
  const profile = step ?? {};
  if (!['pressure', 'flow'].includes(kind) || !['pressure', 'flow'].includes(profile.pump)) return { target: null, limit: null };
  const controlled = profile.pump === kind;
  return {
    target: controlled ? numeric(profile[kind]) : null,
    limit: controlled ? null : numeric(profile.limiter?.value),
  };
}

function dialArtwork(id) {
  return `<defs>
    <mask id="${id}-original-rim" maskUnits="userSpaceOnUse" x="0" y="0" width="220" height="220">
      <circle cx="110" cy="110" r="109.6" fill="white"/>
      <circle cx="110" cy="110" r="94" fill="black"/>
    </mask>
    <linearGradient id="${id}-rim" x1="15%" y1="0%" x2="75%" y2="100%">
      <stop stop-color="#fffefa"/><stop offset=".26" stop-color="#fbf9f2"/>
      <stop offset=".62" stop-color="#e6e0d3"/><stop offset=".84" stop-color="#f8f5ed"/><stop offset="1" stop-color="#d2cbbd"/>
    </linearGradient>
    <radialGradient id="${id}-well" cx="46%" cy="43%" r="58%">
      <stop offset=".73" stop-color="#fcfaf5"/><stop offset=".85" stop-color="#f4f0e7"/>
      <stop offset=".94" stop-color="#dcd6c9"/><stop offset="1" stop-color="#c9c2b5"/>
    </radialGradient>
    <radialGradient id="${id}-face" cx="44%" cy="34%" r="72%">
      <stop stop-color="#fffef9"/><stop offset=".61" stop-color="#faf8f1"/><stop offset="1" stop-color="#f3efe5"/>
    </radialGradient>

    <linearGradient id="${id}-hand-light" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop stop-color="#fffdf2"/><stop offset=".4" stop-color="currentColor" stop-opacity=".62"/><stop offset="1" stop-color="currentColor"/>
    </linearGradient>
    <linearGradient id="${id}-hand-dark" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop stop-color="currentColor"/><stop offset="1" stop-color="#263b3d" stop-opacity=".75"/>
    </linearGradient>
    <linearGradient id="${id}-hub-rim" x1="15%" y1="5%" x2="80%" y2="100%">
      <stop stop-color="#fffefa"/><stop offset=".42" stop-color="#f8f5ec"/><stop offset="1" stop-color="#c6bfb0"/>
    </linearGradient>
    <radialGradient id="${id}-hub" cx="36%" cy="28%" r="79%">
      <stop stop-color="#fffef8"/><stop offset=".7" stop-color="#f2eee3"/><stop offset="1" stop-color="#e1daca"/>
    </radialGradient>
    <filter id="${id}-hand-shadow" x="-100%" y="-20%" width="300%" height="150%">
      <feDropShadow dx=".8" dy="1.5" stdDeviation="1.2" flood-color="#504c3f" flood-opacity=".28"/>
    </filter>
    <filter id="${id}-hub-shadow" x="-50%" y="-50%" width="200%" height="210%">
      <feDropShadow dx=".5" dy="1.5" stdDeviation="1.1" flood-color="#514b3e" flood-opacity=".3"/>
    </filter>
  </defs>
  <g class="dial-ceramic" aria-hidden="true">
    <circle cx="110" cy="110" r="108.5" fill="url(#${id}-rim)" stroke="#fffdf6" stroke-width=".7"/>
    <circle cx="110" cy="110" r="102" fill="url(#${id}-well)"/>
    <circle cx="110" cy="110" r="96" fill="url(#${id}-face)"/>
    <g mask="url(#${id}-original-rim)">
      <image href="./assets/ceramic/slices/dial-rim.png" x="0" y="0" width="220" height="220"/>
    </g>
    <path d="${arc(-135, 135, 87)}" fill="none" stroke="#c3c9c4" stroke-opacity=".15" stroke-width=".6"/>
  </g>
  <g class="dial-target"></g><g class="dial-ticks"></g>
  <g class="dial-hand" style="transform-origin:110px 110px;transform-box:view-box;stroke:none;filter:url(#${id}-hand-shadow)">
    <path d="M110 30L105.5 112L110 115Z" style="fill:url(#${id}-hand-light);stroke:none"/>
    <path d="M110 30L110 115L114.5 112Z" style="fill:url(#${id}-hand-dark);stroke:none"/>
    <path d="M110 32L110 105" style="fill:none;stroke:#fffdf5;stroke-opacity:.45;stroke-width:.55"/>
  </g>
  <g class="dial-hub" aria-hidden="true" style="filter:url(#${id}-hub-shadow)">
    <circle cx="110" cy="110" r="10.3" fill="url(#${id}-hub-rim)"/>
    <circle cx="110" cy="110" r="8" fill="url(#${id}-hub)" stroke="#fffdf5" stroke-width=".8"/>
    <path d="M104 110A6 6 0 0 1 112 104.4" fill="none" stroke="#fffef9" stroke-width=".65" opacity=".7"/>
  </g>`;
}

function drawTicks(min, max, format) {
  const majorCount = min === 80 && max === 100 ? 4 : min === 0 && max === 10 ? 5 : 6;
  const minorCount = majorCount * 5;
  let result = '';
  for (let n = 0; n <= minorCount; n++) {
    const angle = -135 + n * 270 / minorCount;
    const major = n % 5 === 0, start = point(angle, 85), end = point(angle, major ? 77.5 : 81.5);
    result += `<path d="M${start}L${end}" style="fill:none;stroke:var(--ink,#10334a);stroke-width:${major ? '.85' : '.55'};stroke-linecap:round"/>`;
    if (major) {
      // Leave the lower centre clear for the live reading, especially 80/100 °C.
      const labelAngle = n === 0 ? -122 : n === minorCount ? 122 : angle;
      const position = point(labelAngle, 65), value = min + (max - min) * n / minorCount;
      const digits = Math.abs(value - Math.round(value)) < 1e-9 ? 0 : 2;
      result += `<text x="${position[0]}" y="${position[1] + 4}" style="font-family:var(--font-number,Georgia,serif);font-size:13px;fill:var(--ink,#10334a);stroke:none;transform:none;text-anchor:middle">${escapeText(format(value, digits))}</text>`;
    }
  }
  return result;
}

export function paintGauge(el, { value, min = 0, max = 12, target = null, limit = null, color = 'var(--green)', label = '', format = defaultFormat }) {
  if (!el) return;
  const svg = el.querySelector('svg');
  if (!svg) return;
  if (svg.dataset.ceramic !== 'sculpted-1') {
    const id = `thiscup-dial-${++nextDialId}`;
    svg.dataset.ceramic = 'sculpted-1';
    svg.dataset.dialId = id;
    svg.setAttribute('viewBox', '0 0 220 220');
    svg.setAttribute('role', 'img');
    svg.innerHTML = dialArtwork(id);
    delete svg.dataset.range;
    delete svg.dataset.reading;
  }
  svg.style.color = color;
  const low = numeric(min), high = numeric(max), reading = numeric(value);
  const validRange = gaugeAngle(low, low, high) !== null;
  const key = `${low}:${high}`;
  const rangeChanged = svg.dataset.range !== key;
  if (rangeChanged) {
    svg.querySelector('.dial-ticks').innerHTML = validRange ? drawTicks(low, high, format) : '';
    svg.dataset.range = key;
  }

  const requestedTarget = numeric(target), requestedLimit = numeric(limit);
  const setting = requestedLimit ?? requestedTarget;
  const settingAngle = gaugeAngle(setting, low, high);
  const targetLayer = svg.querySelector('.dial-target');
  if (settingAngle === null) targetLayer.innerHTML = '';
  else {
    const mode = requestedLimit !== null ? 'limit' : 'target';
    // Fill from the scale minimum to the exact setting, like a coloured ruler.
    // The target arc locates one scalar target; it is not a tolerance band.
    // Limits retain a heavier arc and a dashed endpoint to distinguish them.
    const band = settingAngle > -135
      ? `<path class="${mode === 'limit' ? 'dial-limit-range' : 'dial-target-position'}" d="${arc(-135, settingAngle, 87)}" fill="none" stroke="currentColor" stroke-width="${mode === 'limit' ? '4.5' : '3.4'}" stroke-opacity=".5"/>` : '';
    targetLayer.innerHTML = `${band}<path class="dial-setting-marker" data-kind="${mode}" data-value="${setting}" data-angle="${settingAngle}" d="M${point(settingAngle, 82)}L${point(settingAngle, 92)}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ${mode === 'limit' ? 'stroke-dasharray="2 1.5"' : ''}/>`;
  }

  const hand = svg.querySelector('.dial-hand'), angle = gaugeAngle(reading, low, high);
  const view = el.ownerDocument?.defaultView ?? globalThis;
  hand.style.opacity = angle === null ? '0' : '1';
  hand.style.color = color;
  movePointer(hand, angle, view, rangeChanged || svg.dataset.reading !== 'known');
  svg.dataset.reading = angle === null ? 'unknown' : 'known';
  const number = el.querySelector('strong');
  if (number) number.textContent = format(reading);
  const settingDescription = settingAngle === null ? '' : ` / ${requestedLimit !== null ? '≤ ' : ''}${format(setting)}`;
  svg.setAttribute('aria-label', `${label} ${format(reading)}${settingDescription}`.trim());
}
