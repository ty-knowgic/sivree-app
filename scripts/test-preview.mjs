import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { downloadSnapshot, readSnapshot } from './preview-data.mjs';
import { createPreviewServer } from './preview-server.mjs';
import { watchPreviewFiles } from './preview-watch.mjs';
import { connectTailnetPreview } from './preview-tailnet.mjs';

const temporary = await mkdtemp(path.join(tmpdir(), 'sivree-preview-test-'));
let server;
try {
  const hostname='test.example.ts.net', calls=[];
  let certs=[], config={};
  const run=async(_command,args)=>{
    calls.push(args);
    return {stdout:args[0]==='status'?JSON.stringify({BackendState:'Running',Self:{ID:'test-node',DNSName:hostname+'.'},CertDomains:certs}):args[1]==='status'?JSON.stringify(config):''};
  };
  const options={backendPort:4174,httpsPort:8444,run};
  assert((await connectTailnetPreview(options)).enableUrl.includes('test-node'));
  assert(!calls.some(args=>args.includes('--bg')),'Missing HTTPS setup must not cause a hanging Serve command');
  certs=[hostname]; await connectTailnetPreview(options);
  assert(calls.some(args=>args.includes('--https=8444')&&args.includes('http://127.0.0.1:4174')));
  config={TCP:{8444:{HTTPS:true}},Web:{[hostname+':8444']:{Handlers:{'/':{Proxy:'http://127.0.0.1:4174'}}}}};
  assert.equal((await connectTailnetPreview(options)).reused,true);
  config.Web[hostname+':8444'].Handlers['/'].Proxy='http://127.0.0.1:9999';
  await assert.rejects(connectTailnetPreview(options),/別のサービス/);
  console.log('✓ Tailnet setup detects missing HTTPS, reuses matching routes, and preserves other services');
  const directory = path.join(temporary,'snapshot');
  const fixture = generation => ({ meta:{schema:2,generatedAt:`2026-10-24T0${generation}:00:00.000Z`}, news:[{id:`article-${generation}`,title:`Generation ${generation}`}], sources:[{feedUrl:'https://example.test/feed'}], summaries:{}, analysis:{pairs:{},topicScores:{}} });
  const generations = [1,2,2,2]; let metaCalls = 0;
  await downloadSnapshot({directory,fetchJson:async name => name === 'meta' ? fixture(generations[metaCalls++]).meta : fixture(metaCalls === 1 ? 1 : 2)[name]});
  const saved = await readSnapshot(directory);
  assert.equal(saved.news[0].id,'article-2'); assert.equal(saved.meta.generatedAt,fixture(2).meta.generatedAt);
  await assert.rejects(downloadSnapshot({directory,fetchJson:async()=>{throw Error('offline');}}));
  assert.deepEqual(await readSnapshot(directory),saved);
  await assert.rejects(downloadSnapshot({directory,fetchJson:async name=>name==='news'?[]:fixture(1)[name]}));
  assert.deepEqual(await readSnapshot(directory),saved);
  let revision = 0;
  await assert.rejects(downloadSnapshot({directory,fetchJson:async name=>name==='meta'?fixture(++revision).meta:fixture(1)[name],attempts:1}));
  assert.deepEqual(await readSnapshot(directory),saved);
  console.log('✓ Snapshot download retries mixed generations and preserves the previous copy on network or validation failure');

  const watched=path.join(temporary,'watched'); await mkdir(watched);
  let changes=0;
  const watcher=await watchPreviewFiles({directories:[watched],intervalMs:20,onChange:()=>changes++});
  const until=async condition=>{const start=Date.now();while(!condition()&&Date.now()-start<3000)await new Promise(resolve=>setTimeout(resolve,20));assert(condition());};
  try {
    await writeFile(path.join(watched,'app.js'),'first'); await until(()=>changes>=1);
    await writeFile(path.join(watched,'app.js'),'second'); await until(()=>changes>=2);
    await rm(path.join(watched,'app.js')); await until(()=>changes>=3);
  } finally {watcher.close();}
  console.log('✓ Source additions, edits and removals are detected without OS file watchers');

  const site=path.join(temporary,'site'); await mkdir(site);
  await writeFile(path.join(site,'index.html'),'<title>Local Sivree</title>');
  await writeFile(path.join(site,'app.js'),'localCode();');
  const outside=path.join(temporary,'private.txt'); await writeFile(outside,'must not be served');
  await symlink(outside,path.join(site,'outside.txt'));
  server=createPreviewServer({resolveDirectory:version=>!version||version==='known'?site:undefined,delayMs:20,status:()=>({mode:'test',version:'known'})});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const page=await fetch(origin); assert.equal(page.status,200); assert.equal(await page.text(),'<title>Local Sivree</title>');
  assert.equal(page.headers.get('cache-control'),'no-store');
  const script=await fetch(`${origin}/app.js?v=known`); assert.equal(await script.text(),'localCode();'); assert(script.headers.get('content-type').includes('javascript'));
  assert.equal((await fetch(`${origin}/app.js?v=unknown`)).status,404);
  const head=await fetch(origin,{method:'HEAD'}); assert.equal(head.status,200); assert.equal(await head.text(),'');
  assert.equal((await fetch(origin,{method:'POST',body:'settings'})).status,405);
  for(const resource of ['/outside.txt','/.git/config','/%2e%2e%2fprivate.txt','/data/profile.json','/%E0%A4%A']) assert.notEqual((await fetch(origin+resource)).status,200);
  assert.deepEqual(await (await fetch(`${origin}/__preview/status`)).json(),{mode:'test',version:'known'});
  assert.equal(await readFile(outside,'utf8'),'must not be served');
  console.log('✓ Preview serves complete versioned assets, supports HEAD, and does not expose profiles, parent files, or external symlinks');
} finally {
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await rm(temporary,{recursive:true,force:true});
}
