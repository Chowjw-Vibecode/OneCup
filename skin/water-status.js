// Tank calibration from classic DE1 app (vars.tcl, water_tank_level_to_milliliters).
// https://github.com/decentespresso/de1app/blob/d83a7f46341c98c1367bb828b36d282e9214308c/de1plus/vars.tcl#L4205
const TANK_ML = [
  0, 16, 43, 70, 97, 124, 151, 179, 206, 233, 261, 288, 316, 343,
  371, 398, 426, 453, 481, 509, 537, 564, 592, 620, 648, 676, 704, 732,
  760, 788, 816, 844, 872, 900, 929, 957, 985, 1013, 1042, 1070, 1104,
  1138, 1172, 1207, 1242, 1277, 1312, 1347, 1382, 1417, 1453, 1488,
  1523, 1559, 1594, 1630, 1665, 1701, 1736, 1772, 1808, 1843, 1879,
  1915, 1951, 1986, 2022, 2058,
];
const MAX_ML = TANK_ML.at(-1);
export const validWaterHeight = value => Number.isFinite(value) && value >= 0;

export function waterView(snapshot, connection, language) {
  const live = connection.connected && connection.machineConnected && !connection.stale;
  const { water, waterMachine, machine } = snapshot;
  const level = water?.currentLevel;
  const tankModel = String(waterMachine?.model ?? '').replace(/[\s+-]/g, '');
  const calibrated = /^de1(?:plus|pro|cafe|xl|xxl|xxxl)?$/i.test(tankModel);
  const ml = live && calibrated && validWaterHeight(level)
    ? TANK_ML[Math.min(Math.trunc(level), TANK_ML.length - 1)]
    : null;
  const refillKit = live && waterMachine?.refillKit === true;
  const refillDisabled = refillKit && waterMachine.refillDisabled === true;
  const state = live ? machine?.state : null;
  const fault = state?.substate === 'refillStopped';
  const low = live && (!refillKit || refillDisabled) && (
    state?.state?.toLowerCase() === 'needswater' ||
    (ml !== null && validWaterHeight(water.refillLevel) && level <= water.refillLevel)
  );
  const tone = fault || low ? 'warning' : ml === null ? 'unknown' : 'normal';
  const label = language === 'en'
    ? fault ? 'Refill stopped' : low ? 'Low water' : 'Water'
    : fault ? '上水停止' : low ? '水位低' : '水位';
  return { tone, label, ml, fill: ml === null ? 0 : ml / MAX_ML * 100, refillKit, refillDisabled, language };
}

const elements = new Set();
let current = waterView({}, {}, 'zh');
let signature = JSON.stringify(current);

export function updateWaterStatus(snapshot, connection, language) {
  const next = waterView(snapshot, connection, language);
  const key = JSON.stringify(next);
  if (key === signature) return;
  signature = key;
  current = next;
  for (const element of elements) element.update(next);
}

export function registerWaterStatus() {
  // A shared read-only component also works inside the online picker and the
  // same-origin flavor-wheel frame. Each instance inherits its local theme.
  customElements.define('onecup-water', class extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host { display: inline-flex; flex: none; align-items: center; max-width: 100%;
          white-space: nowrap; font: 600 clamp(12px, 1.35vw, 16px)/1.15 system-ui, sans-serif; }
        .badge { display: inline-flex; align-items: center; gap: .42em; min-height: 1.85em;
          padding: .16em .55em; border: 1px solid var(--water-border, #afcad4); border-radius: .5em;
          color: var(--water-text, #15536c); background: var(--water-bg, #eaf5f7);
          font-variant-numeric: tabular-nums; }
        .tank { position: relative; overflow: hidden; flex: none; width: .75em; height: .94em;
          border: 1px solid currentColor; border-radius: .18em .18em .25em .25em; }
        .tank::after { content: ""; position: absolute; inset: auto 0 0; height: var(--fill, 0%);
          background: var(--water-fill, #3a9ab2); }
        .badge[data-tone="warning"] { color: var(--water-warn-text, #8a3d19);
          border-color: var(--water-warn-border, #dca378); background: var(--water-warn-bg, #fff0df);
          --water-fill: var(--water-warn-fill, #b95c2f); }
        .badge[data-tone="unknown"] { color: var(--water-off-text, #455762);
          border-color: var(--water-off-border, #bdc9cb); background: var(--water-off-bg, #f0f3f3); }
        .kit { display: inline-flex; border-inline-start: 1px solid var(--water-divider, #a9c8d6);
          padding-inline-start: .38em; color: var(--water-kit, #17634c); }
        .kit[hidden] { display: none; }
        svg { width: 1.35em; height: 1.35em; display: block; }
      </style>
      <span class="badge">
        <i class="tank" aria-hidden="true"></i><span class="label"></span><strong></strong>
        <span class="kit" role="img" hidden><svg viewBox="0 0 24 24" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"
            stroke-linejoin="round" d="M20.4 10a8.7 8.7 0 1 1-3.2-4.9M17.2 2.4v3.1h-3.3"/>
          <path fill="currentColor" d="M12 6.5C10.8 8.4 8.6 10.6 8.6 13a3.4 3.4 0 1 0 6.8 0c0-2.4-2.2-4.6-3.4-6.5Z"/>
        </svg></span>
      </span>`;
      this.badge = root.querySelector('.badge');
      this.label = this.badge.querySelector('.label');
      this.reading = this.badge.querySelector('strong');
      this.kit = this.badge.querySelector('.kit');
    }
    connectedCallback() { elements.add(this); this.update(current); }
    disconnectedCallback() { elements.delete(this); }
    update({ tone, label, ml, fill, refillKit, refillDisabled, language }) {
      this.badge.dataset.tone = tone;
      this.badge.style.setProperty('--fill', `${fill}%`);
      this.label.textContent = label;
      this.reading.textContent = ml === null ? '—' : `${ml} mL`;
      const kitText = language === 'en'
        ? refillDisabled ? 'Automatic refill kit detected, disabled' : 'Automatic refill kit detected'
        : refillDisabled ? '已检测到自动上水器，当前停用' : '已检测到自动上水器';
      this.kit.hidden = !refillKit;
      this.kit.title = kitText;
      this.kit.setAttribute('aria-label', kitText);
    }
  });
}
