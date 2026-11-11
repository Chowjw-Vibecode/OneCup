// Gitee public releases omit GitHub's draft, asset state and byte size fields.
// Only an actual release attachment plus our matching publication declaration
// supplies the normalized fields below. The declared SHA-256 is not proof that
// the downloaded bytes have been verified by this metadata adapter.
const MAX_ASSET_BYTES = 150 * 1024 * 1024;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/;

function validRepository(repository) {
  return typeof repository === 'string' && repository.length <= 201 &&
    REPOSITORY.test(repository) && repository.split('/').every(part=>part.length <= 100);
}
function requireRepository(repository) {
  if (!validRepository(repository)) throw new TypeError('Invalid mirror repository');
}
function releaseVersion(tag) {
  const match = typeof tag === 'string' && tag.match(TAG);
  if (!match || ![match[1],match[2],match[3],match[5] ?? '0'].every(n=>Number.isSafeInteger(Number(n)))) return null;
  return {version:tag.slice(1),prerelease:Boolean(match[4])};
}
export function mirrorReleasesUrl(repository) {
  requireRepository(repository);
  return `https://gitee.com/api/v5/repos/${repository}/releases?per_page=100`;
}
export function trustedMirrorAsset(url, tag, name, repository) {
  const next = releaseVersion(tag);
  if (!validRepository(repository) || !next || name !== `onecup-${next.version}.zip` || typeof url !== 'string') return false;
  // Exact comparison also rejects credentials, ports, query/fragment suffixes,
  // encoded path separators, URL normalization tricks and archive/source links.
  return url === `https://gitee.com/${repository}/releases/download/${tag}/${name}`;
}
function assetDeclaration(body, expectedName) {
  if (typeof body !== 'string') return null;
  const declarations = [];
  for (const match of body.matchAll(/<!--\s*onecup-asset\s+([\s\S]*?)\s*-->/g)) {
    let value;
    try { value = JSON.parse(match[1]); } catch { return null; }
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).sort().join(',') !== 'name,sha256,size' ||
        typeof value.name !== 'string' || !Number.isSafeInteger(value.size) ||
        value.size <= 0 || value.size > MAX_ASSET_BYTES ||
        typeof value.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(value.sha256)) return null;
    if (value.name === expectedName) declarations.push(value);
  }
  return declarations.length === 1 ? declarations[0] : null;
}
export function normalizeMirrorReleases(rows, repository) {
  requireRepository(repository);
  if (!Array.isArray(rows)) throw new TypeError('Invalid mirror releases response');
  if (rows.length === 0) return [];
  const releases = [];
  for (const row of rows) {
    const next = releaseVersion(row?.tag_name);
    if (!next || (Object.hasOwn(row,'draft') && row.draft !== false) || row.prerelease !== next.prerelease || !Array.isArray(row.assets)) continue;
    const name = `onecup-${next.version}.zip`;
    const declaration = assetDeclaration(row.body, name);
    if (!declaration) continue;
    const attachments = row.assets.filter(asset=>asset?.name === name &&
      trustedMirrorAsset(asset.browser_download_url, row.tag_name, name, repository));
    if (attachments.length !== 1) continue;
    releases.push({
      tag_name:row.tag_name,
      draft:false,
      prerelease:next.prerelease,
      assets:[{
        name,
        browser_download_url:attachments[0].browser_download_url,
        size:declaration.size,
        state:'uploaded',
        digest:`sha256:${declaration.sha256.toLowerCase()}`,
      }],
    });
  }
  if (releases.length === 0) throw new Error('No verifiable OneCup release in mirror response');
  return releases;
}

// Audited Decaid build: these complete native responses precede directory changes.
const AUDITED_NATIVE_COMMIT='14361a94b32888f6a81182e9e239f513d39d060c';
const DOWNLOAD_ERRORS=new Set([
 "Couldn't install the skin. Sign in to the service and try again.",
 "Couldn't install the skin. The service refused access. Check repository access or try again later.",
 "Couldn't install the skin. The repository, release, or download was not found. Check the address and try again.",
 "Couldn't install the skin. The service is receiving too many requests. Try again later.",
 "Couldn't install the skin. The service could not complete the request. Try again later.",
 "Couldn't install the skin. A secure connection could not be established. Try again later.",
 "Couldn't install the skin. The connection took too long. Try again.",
 "Couldn't install the skin. Check your internet connection and try again.",
]);
export function confirmedMirrorDownloadFailure(error,nativeCommit){
 return nativeCommit===AUDITED_NATIVE_COMMIT&&error?.status===500&&
  error.details!==null&&typeof error.details==='object'&&!Array.isArray(error.details)&&
  Object.keys(error.details).length===1&&DOWNLOAD_ERRORS.has(error.details.error);
}
