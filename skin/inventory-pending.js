// Only confirmed finished-shot IDs belong here. The caller reloads each saved
// shot before retrying consumption; coffee details are never copied to storage.
const PREFIX = 'thiscup.inventory-pending:';
const validId = id => typeof id === 'string' && id.trim().length > 0 && id.length <= 512 && !/[\u0000-\u001f]/.test(id);

function keyFor(client) {
  if (typeof client?.baseUrl !== 'string' || !client.baseUrl.trim()) throw new Error('Invalid inventory host');
  const url = new URL(client.baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Invalid inventory host');
  return PREFIX + encodeURIComponent(url.origin + url.pathname.replace(/\/$/, ''));
}

function readLegacy(storage, key) {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid pending inventory queue'); }
  if (!value || value.version !== 1 || !Array.isArray(value.ids) || value.ids.some(id => !validId(id)))
    throw new Error('Invalid pending inventory queue');
  return [...new Set(value.ids)];
}

function readEntry(storage, key) {
  const raw=storage.getItem(key);
  if(raw===null)return null;
  let value;
  try { value=JSON.parse(raw); } catch { throw new Error('Invalid pending inventory entry'); }
  if(!value || value.version!==1 || !validId(value.id) || !key.endsWith('/'+encodeURIComponent(value.id)))
    throw new Error('Invalid pending inventory entry');
  return value.id;
}

export function pendingInventoryIds(client, storage = globalThis.localStorage) {
  const key=keyFor(client),ids=readLegacy(storage,key),prefix=key+'/';
  // Each cup has its own key. Two tabs adding different cups cannot overwrite
  // one another's queue. Legacy arrays remain readable until acknowledged.
  const keys=[];
  for(let i=0;i<storage.length;i++){const entry=storage.key(i);if(entry?.startsWith(prefix))keys.push(entry);}
  for(const entry of keys){const id=readEntry(storage,entry);if(id!==null)ids.push(id);}
  return [...new Set(ids)];
}

export function pendingInventoryCursor(client, storage = globalThis.localStorage) {
  const raw=storage.getItem(keyFor(client)+':cursor');
  if(raw===null)return null;
  let value;
  try { value=JSON.parse(raw); } catch { throw new Error('Invalid inventory recovery cursor'); }
  if(!value || value.version!==1 || !validId(value.id))throw new Error('Invalid inventory recovery cursor');
  return value.id;
}

export function rememberInventoryAttempt(client, id, storage = globalThis.localStorage) {
  if(!validId(id))throw new Error('Invalid pending shot ID');
  storage.setItem(keyFor(client)+':cursor',JSON.stringify({version:1,id}));
  if(pendingInventoryCursor(client,storage)!==id)throw new Error('Inventory recovery cursor save not confirmed');
}

export function rememberInventoryShot(client, id, storage = globalThis.localStorage) {
  if (!validId(id)) throw new Error('Invalid pending shot ID');
  const key = keyFor(client),entry=key+'/'+encodeURIComponent(id);
  readLegacy(storage,key); // Do not conceal a damaged older queue.
  if (readEntry(storage,entry)===null) {
    storage.setItem(entry, JSON.stringify({version: 1, id}));
    if (readEntry(storage,entry)!==id) throw new Error('Pending inventory save not confirmed');
  }
}

export function forgetInventoryShot(client, id, storage = globalThis.localStorage) {
  if (!validId(id)) throw new Error('Invalid pending shot ID');
  const key = keyFor(client), ids = readLegacy(storage, key),entry=key+'/'+encodeURIComponent(id);
  if(readEntry(storage,entry)!==null){
    storage.removeItem(entry);
    if(readEntry(storage,entry)!==null)throw new Error('Pending inventory removal not confirmed');
  }
  if (ids.includes(id)) {
    // The old array is only reduced after remote confirmation. New entries
    // never write it, and it is never pruned by age or count.
    storage.setItem(key, JSON.stringify({version: 1, ids: ids.filter(value => value !== id)}));
    if (readLegacy(storage, key).includes(id)) throw new Error('Pending inventory removal not confirmed');
  }
}
