// Interpolate only the rendered path. Original telemetry remains the source of
// truth for readings, statistics and cursor inspection.
const finiteNumber = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const coordinate = (point) => `${point.x},${point.y}`;
const sameSign = (a, b) => Math.sign(a) === Math.sign(b);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function endpointSlope(first, second, firstWidth, secondWidth) {
  const scale = Math.max(firstWidth, secondWidth);
  const ratio = (firstWidth / scale) / (firstWidth / scale + secondWidth / scale);
  let slope = (1 + ratio) * first - ratio * second;
  if (!Number.isFinite(slope)) return first;
  if (!sameSign(slope, first)) return 0;
  if (!sameSign(first, second) && Math.abs(slope / first) > 3) slope = 3 * first;
  return slope;
}

// PCHIP derivatives: weighted harmonic means at interior samples, limited
// one-sided derivatives at the ends. Local extrema and flat spans have zero
// tangents. We calculate in plot coordinates, including an inverted y axis.
function slopes(points) {
  const widths = [], secants = [];
  for (let i = 1; i < points.length; i++) {
    const width = points[i].time - points[i - 1].time;
    const secant = (points[i].y - points[i - 1].y) / width;
    if (!(width > 0) || !Number.isFinite(width) || !Number.isFinite(secant)) return null;
    widths.push(width);
    secants.push(secant);
  }
  const last = secants.length - 1;
  const result = [endpointSlope(secants[0], secants[1], widths[0], widths[1])];
  for (let i = 1; i < points.length - 1; i++) {
    const before = secants[i - 1], after = secants[i];
    if (before === 0 || after === 0 || !sameSign(before, after)) {
      result.push(0);
      continue;
    }
    const scale = Math.max(widths[i - 1], widths[i]);
    const a = widths[i - 1] / scale, b = widths[i] / scale;
    const w1 = (2 * b + a) / (3 * (a + b)), w2 = 1 - w1;
    const magnitude = Math.min(Math.abs(before), Math.abs(after));
    result.push(Math.sign(before) * magnitude /
      (w1 * (magnitude / Math.abs(before)) + w2 * (magnitude / Math.abs(after))));
  }
  result.push(endpointSlope(secants[last], secants[last - 1], widths[last], widths[last - 1]));
  return result;
}

function curvedRun(points) {
  const derivatives = points.length > 2 ? slopes(points) : null;
  let result = '';
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!derivatives || a.y === b.y) {
      result += `L${coordinate(b)}`;
      continue;
    }
    const third = (b.time - a.time) / 3;
    const low = Math.min(a.y, b.y), high = Math.max(a.y, b.y);
    // Keep every control ordinate within its sample interval. This also
    // protects the no-overshoot guarantee against floating-point roundoff.
    const y1 = clamp(a.y + derivatives[i - 1] * third, low, high);
    const y2 = clamp(b.y - derivatives[i] * third, low, high);
    const x1 = a.x + (b.x - a.x) / 3, x2 = b.x - (b.x - a.x) / 3;
    if (![x1, x2, y1, y2].every(Number.isFinite)) result += `L${coordinate(b)}`;
    else result += `C${x1},${y1},${x2},${y2},${coordinate(b)}`;
  }
  return result;
}

function pathRun(points, smooth) {
  if (!points.length) return '';
  let result = `M${coordinate(points[0])}`;
  if (!smooth) return result + points.slice(1).map((p) => `L${coordinate(p)}`).join('');

  const straight = new Set();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.time === b.time || (a.frame !== null && b.frame !== null && a.frame !== b.frame)) {
      // Do not round a phase transition or a same-time step, including its
      // immediate neighbours. Derivatives never sample across these edges.
      for (let edge = Math.max(1, i - 1); edge <= Math.min(points.length - 1, i + 1); edge++) straight.add(edge);
    }
  }
  let i = 1;
  while (i < points.length) {
    if (straight.has(i)) {
      result += `L${coordinate(points[i++])}`;
    } else {
      let end = i + 1;
      while (end < points.length && !straight.has(end)) end++;
      result += curvedRun(points.slice(i - 1, end));
      i = end;
    }
  }
  return result;
}

/**
 * SVG path through unmodified samples {time, [key], frame?}.
 * x/y are the chart's finite axis projections. Missing values break the path;
 * backward timestamps start a new subpath; duplicate times remain straight
 * vertical steps. With smooth=false all valid edges stay straight, preserving
 * the duplicated-time steps supplied by targets and planned profiles.
 */
export function telemetryPath(points, key, x, y, { smooth = true } = {}) {
  if (!Array.isArray(points) || !points.length) return '';
  let result = '', run = [];
  const flush = () => { result += pathRun(run, smooth); run = []; };
  for (const source of points) {
    const time = finiteNumber(source?.time), value = finiteNumber(source?.[key]);
    if (time === null || value === null) { flush(); continue; }
    const px = x(time), py = y(value);
    if (!Number.isFinite(px) || !Number.isFinite(py)) { flush(); continue; }
    if (run.length && time < run[run.length - 1].time) flush();
    run.push({ time, x: px, y: py, frame: finiteNumber(source?.frame) });
  }
  flush();
  return result;
}
