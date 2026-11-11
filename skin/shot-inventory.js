import {recordBeanConsumption} from './beans.js?v=0.2.36';

// Use the saved shot, never today's selection or a later tasting annotation.
export function consumptionOf(shot) {
  const context=shot?.workflow?.context;
  if (!context?.extras?.thisCupBeanId) return null;
  const actual=shot.annotations?.actualDoseWeight;
  const dose=typeof actual==='number'&&Number.isFinite(actual)&&actual>0&&actual<=10000?actual:context.targetDoseWeight;
  return {shotId:shot.id,beanId:context.extras.thisCupBeanId,
    dose,shotTimestamp:shot.timestamp};
}
export async function consumeSavedShot(client,shot) {
  const event=consumptionOf(shot);
  if(!event)return null;
  // The first confirmed consumption freezes the dose. Editing later tasting
  // annotations must neither rewrite that event nor prevent recovery after a
  // successful write whose response was lost.
  let existing;
  try { existing=await client.get('/store/thiscup-bean-usage/'+encodeURIComponent(event.shotId)); }
  catch(error){if(error.status!==404)throw error;}
  if(existing?.version===1&&existing.shotId===event.shotId&&existing.beanId===event.beanId)
    return recordBeanConsumption(client,{...event,dose:existing.dose,shotTimestamp:existing.shotTimestamp});
  return recordBeanConsumption(client,event);
}
