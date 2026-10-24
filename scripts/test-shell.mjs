import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const source = await readFile('public/sw.js', 'utf8');
const stores = new Map();
let networkCalls = 0, offline = false, failPath = '';
const fetch = async input => {
  networkCalls++;
  const url = typeof input === 'string' ? input : input.url;
  if (offline || url.includes(failPath || '\0')) throw Error('network unavailable');
  return new Response(url);
};
const caches = {
  keys: async () => [...stores.keys()],
  delete: async name => stores.delete(name),
  match: async key => { for(const entries of stores.values()) if(entries.has(key)) return entries.get(key).clone(); },
  open: async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      addAll: async urls => { const responses = await Promise.all(urls.map(fetch)); urls.forEach((url, i) => entries.set(url, responses[i])); },
      match: async key => entries.get(key)?.clone()
    };
  }
};
const shell = version => {
  const handlers = {}, state = { claimed: false, installed: false };
  const self = { registration: { scope: 'https://example.test/app/' }, addEventListener: (name, fn) => handlers[name] = fn,
    skipWaiting: async () => { state.installed = true; }, clients: { claim: async () => { state.claimed = true; } } };
  const files = ['index.html', `app.js?v=${version}`, `styles.css?v=${version}`];
  vm.runInNewContext(source.replace('__SIVREE_SHELL_VERSION__', version).replace('const SHELL_FILES = [];', `const SHELL_FILES = ${JSON.stringify(files)};`), { self, caches, fetch, URL });
  return { state,
    run: async name => { let done; handlers[name]({ waitUntil: p => done = p }); await done; },
    request: async (path, mode = 'cors', method = 'GET') => { let response; handlers.fetch({ request: { url: `https://example.test${path}`, method, mode }, respondWith: p => response = p }); return response; }
  };
};
let worker = shell('1');
await worker.run('install'); await worker.run('activate');
assert(worker.state.installed && worker.state.claimed);
const before = networkCalls; offline = true;
assert.equal(await (await worker.request('/app/', 'navigate')).text(), 'https://example.test/app/index.html');
assert.equal(await (await worker.request('/app/app.js?v=1')).text(), 'https://example.test/app/app.js?v=1');
assert.equal(networkCalls, before, 'Warm navigation and scripts must not wait for a network response');
for (const path of ['/app/data/news.json', '/app/api/profile', '/app/about.html', '/outside/']) assert.equal(await worker.request(path), undefined);
assert.equal(await worker.request('/app/app.js?v=1', 'cors', 'POST'), undefined);
offline = false; failPath = 'styles.css';
worker = shell('2');
await assert.rejects(worker.run('install'));
assert.equal(worker.state.installed, false);
assert(stores.has('sivree-shell-1'), 'Failed updates must preserve the readable old shell');
failPath = ''; await worker.run('install'); await worker.run('activate');
assert.equal(await (await worker.request('/app/app.js?v=2')).text(), 'https://example.test/app/app.js?v=2');
offline = true;
assert.equal(await (await worker.request('/app/app.js?v=1')).text(), 'https://example.test/app/app.js?v=1');
offline = false;
worker = shell('3'); await worker.run('install'); await worker.run('activate');
assert.deepEqual([...stores.keys()], ['sivree-shell-2', 'sivree-shell-3']);
console.log('✓ Returning navigation and assets use the local shell with no network wait');
console.log('✓ News, settings, other pages and mutations never enter the shell cache');
console.log('✓ Versioned upgrades are atomic and a failed upgrade keeps the previous shell');

const messagesCode = await readFile('public/i18n.js', 'utf8');
const dictionaryStore = new Map();
let messageCalls = 0;
async function messages(fail = false) {
  const dom = new JSDOM('<!doctype html>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.localStorage.setItem('sivry:lang', 'en');
  for (const [key,value] of dictionaryStore) w.localStorage.setItem(key,value);
  w.fetch = async () => { messageCalls++; if(fail) throw Error('offline'); return {ok:true,json:async()=>({'保存':'Save'})}; };
  w.eval(messagesCode + '\nwindow.messagesReady = i18nReady; window.translate = t;');
  await w.messagesReady;
  assert.equal(w.translate('保存'), 'Save');
  for(let i=0;i<w.localStorage.length;i++) { const key=w.localStorage.key(i); dictionaryStore.set(key,w.localStorage.getItem(key)); }
  dom.window.close();
}
await messages(); assert.equal(messageCalls,2);
await messages(true); assert.equal(messageCalls,2,'Cached translations must not wait for network');
dictionaryStore.set('sivree:messages:en',JSON.stringify({version:'old',messages:{'保存':'Wrong'}}));
await messages(); assert.equal(messageCalls,3,'A new asset version must replace stale translations');
console.log('✓ Returning translations work offline; a version mismatch reloads the dictionary');
