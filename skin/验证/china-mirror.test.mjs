import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mirrorReleasesUrl,trustedMirrorAsset,normalizeMirrorReleases} from '../china-mirror.js';
const repo='example-owner/OneCup';
const sha='a7'.repeat(32);
function release(version='0.2.35',overrides={}) {
  const tag=`v${version}`,name=`onecup-${version}.zip`;
  return {tag_name:tag,prerelease:version.includes('-'),
    body:`Release notes\n<!-- onecup-asset ${JSON.stringify({name,size:51968060,sha256:sha})} -->`,
    assets:[{name,browser_download_url:`https://gitee.com/${repo}/releases/download/${tag}/${name}`}],...overrides};
}
function metadata(change) {const row=release();row.body=`<!-- onecup-asset ${JSON.stringify({name:'onecup-0.2.35.zip',size:51968060,sha256:sha,...change})} -->`;return row;}
function invalid(row){assert.throws(()=>normalizeMirrorReleases([row],repo),/No verifiable/);}

test('repository must be explicit owner/repo; no credentials or path escapes enter URLs',()=>{
  assert.equal(mirrorReleasesUrl(repo),`https://gitee.com/api/v5/repos/${repo}/releases?per_page=100`);
  assert.equal(mirrorReleasesUrl('owner.name/repo_name-2'), 'https://gitee.com/api/v5/repos/owner.name/repo_name-2/releases?per_page=100');
  for(const value of [undefined,null,'','owner','/repo','owner/','a/b/c','../repo','a/..','a/%2e%2e','a/repo?x=1','a/repo#x','a/repo\\x','https://gitee.com/a/b','用户名/repo','a/@repo',' a/b','a/b\n','a'.repeat(101)+'/b']) {
    assert.throws(()=>mirrorReleasesUrl(value),/Invalid mirror repository/);
    assert.throws(()=>normalizeMirrorReleases([],value),/Invalid mirror repository/);
    assert.equal(trustedMirrorAsset(release().assets[0].browser_download_url,'v0.2.35','onecup-0.2.35.zip',value),false);
  }
});

test('only the exact HTTPS repository release asset is trusted',()=>{
  const good=release().assets[0].browser_download_url;
  assert.equal(trustedMirrorAsset(good,'v0.2.35','onecup-0.2.35.zip',repo),true);
  for(const bad of [good.replace('https:','http:'),good.replace('gitee.com','gitee.com.evil.test'),good.replace('gitee.com','GITEE.COM'),good.replace('gitee.com','user:pass@gitee.com'),good.replace('gitee.com','gitee.com:443'),good+'?download=1',good+'#x',good.replace(repo,'other/OneCup'),good.replace('/releases/download/','/archive/refs/tags/'),good.replace('onecup-0.2.35.zip','onecup-0.2.34.zip'),good.replace('releases/','releases%2f'),good.replace('/releases/','/ignored/../releases/'),good+'/',null]) assert.equal(trustedMirrorAsset(bad,'v0.2.35','onecup-0.2.35.zip',repo),false,String(bad));
});

test('version tag and package name must agree with the updater channel syntax',()=>{
  for(const version of ['0.2.35','1.0.0-rc.1','1.0.0-alpha.0','1.0.0-beta.2']) {
    const row=release(version);assert.equal(trustedMirrorAsset(row.assets[0].browser_download_url,row.tag_name,row.assets[0].name,repo),true);
    assert.equal(normalizeMirrorReleases([row],repo)[0].prerelease,version.includes('-'));
  }
  for(const version of ['01.2.35','0.02.35','0.2.035','0.2.35-rc.01','0.2.35-dev.1','0.2.35+build','9007199254740992.0.0']) invalid(release(version));
  invalid(release('0.2.35',{tag_name:'0.2.35'}));
  invalid(release('0.2.35',{prerelease:true}));
  invalid(release('0.2.35-rc.1',{prerelease:false}));
  invalid(release('0.2.35',{prerelease:undefined}));
});

test('normalization gets real size and digest from declaration, never from a fabricated constant',()=>{
  const source=release(),before=JSON.stringify(source),result=normalizeMirrorReleases([source],repo);
  assert.deepEqual(result,[{tag_name:'v0.2.35',draft:false,prerelease:false,assets:[{name:'onecup-0.2.35.zip',browser_download_url:source.assets[0].browser_download_url,size:51968060,state:'uploaded',digest:`sha256:${sha}`}]}]);
  assert.equal(JSON.stringify(source),before);
  assert.equal(normalizeMirrorReleases([metadata({size:1})],repo)[0].assets[0].size,1);
  assert.equal(normalizeMirrorReleases([metadata({size:150*1024*1024,sha256:sha.toUpperCase()})],repo)[0].assets[0].digest,`sha256:${sha}`);
});

test('missing declaration or actual attachment cannot become an uploaded asset',()=>{
  for(const body of [undefined,null,'ordinary notes','<!-- onecup-asset {bad json} -->','<!-- onecup-asset null -->','<!-- onecup-asset [] -->']) invalid(release('0.2.35',{body}));
  invalid(release('0.2.35',{assets:[]}));invalid(release('0.2.35',{assets:null}));
  const archive=release();archive.assets[0].browser_download_url=`https://gitee.com/${repo}/archive/refs/tags/v0.2.35.zip`;invalid(archive);
  const nameMismatch=release();nameMismatch.assets[0].name='source.zip';invalid(nameMismatch);
  invalid(metadata({name:'onecup-0.2.34.zip'}));
  for(const draft of [true,'false',null])invalid(release('0.2.35',{draft}));
});

test('byte size and SHA-256 boundaries fail closed',()=>{
  for(const size of [0,-1,1.2,150*1024*1024+1,Number.MAX_SAFE_INTEGER+1,'51968060',null]) invalid(metadata({size}));
  for(const sha256 of ['',sha.slice(1),sha+'a','g'.repeat(64),`sha256:${sha}`,null,123]) invalid(metadata({sha256}));
  invalid(metadata({extra:'unexpected'}));
  const absent=metadata({});absent.body=absent.body.replace(`,"sha256":"${sha}"`,'');invalid(absent);
});

test('ambiguous or malformed publication declarations and duplicate attachments fail closed',()=>{
  const duplicate=release();duplicate.body+=duplicate.body;invalid(duplicate);
  const malformed=release();malformed.body+='<!-- onecup-asset {malformed} -->';invalid(malformed);
  const attachments=release();attachments.assets.push({...attachments.assets[0]});invalid(attachments);
});

test('empty mirrors are valid; non-empty unverified responses trigger fallback; mixed lists retain only valid releases',()=>{
  assert.deepEqual(normalizeMirrorReleases([],repo),[]);
  for(const bad of [null,undefined,{},'[]'])assert.throws(()=>normalizeMirrorReleases(bad,repo),/Invalid mirror releases response/);
  for(const rows of [[null],[{}],[{tag_name:'2.8.4-release',prerelease:false,assets:[{name:'2.8.4-release.zip',browser_download_url:'https://gitee.com/ld/J2Cache/archive/refs/tags/2.8.4-release.zip'}]}]])assert.throws(()=>normalizeMirrorReleases(rows,repo),/No verifiable/);
  assert.equal(normalizeMirrorReleases([null,release('0.2.34',{body:''}),release()],repo).length,1);
});
