// Machine timestamps remain untouched; only the display origin changes.
export const isPreparation = machine => ['preparingForShot','heating','preheating'].includes(machine?.state?.substate);
export const isProfileSample = machine => ['preinfusion','pouring'].includes(machine?.state?.substate);
export function shotMeasurements(measurements) {
  const start = measurements.findIndex(p => isProfileSample(p.machine));
  if (start >= 0) return measurements.slice(start);
  return measurements.some(p => isPreparation(p.machine)) ? [] : measurements;
}
export function collapseProgress(now, started) {
  const t=Math.max(0,Math.min(1,(now-started)/1500));
  return t*t*(3-2*t);
}
