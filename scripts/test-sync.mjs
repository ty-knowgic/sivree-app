// Google ドライブ同期（public/sync.js）を、偽の Drive と偽の Google ログインで確かめる。
// 実際の Google とは通信しない。端末は、別々の localStorage と別々の window で表す。
// 偽のログイン画面は iPhone の Safari と同じく、押した操作の中で（間に待ちを挟まずに）開いたときだけ開く。
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../public/sync.js', import.meta.url), 'utf8');
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failures++; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 共有のドライブ（appDataFolder）。ファイルは更新の順番（modifiedTime）を持つ
const drive = { files: [], calls: [], clock: 0, revoked: false, scope: SCOPE };
const newest = () => [...drive.files].sort((a, b) => b.modifiedTime - a.modifiedTime)[0];
const remote = () => newest()?.content;

function device({ storage = {}, profile = { regions: ['JP'], marker: 'initial' }, gis = true } = {}) {
  const dom = new JSDOM('<!doctype html><head></head><body></body>', { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  const popups = { opened: 0, blocked: 0 };
  let gesture = false;
  const installGis = () => {
    w.google = { accounts: { oauth2: {
      initTokenClient: (cfg) => ({
        requestAccessToken: () => {
          if (!gesture) { popups.blocked++; setTimeout(() => cfg.error_callback?.({ type: 'popup_failed_to_open' }), 0); return; }
          popups.opened++;
          setTimeout(() => cfg.callback({ access_token: 'tok', expires_in: 3600, scope: drive.scope }), 5);
        }
      }),
      hasGrantedAllScopes: (response, scope) => String(response.scope).split(' ').includes(scope),
      revoke: () => {}
    } } };
  };
  if (gis) installGis();
  else {
    // Google のスクリプトがまだない端末: <script> を追加すると、少し遅れて読み込まれる
    const append = w.document.head.appendChild.bind(w.document.head);
    w.document.head.appendChild = (node) => {
      if (!String(node.src).includes('accounts.google.com')) return append(node);
      setTimeout(() => { installGis(); node.onload?.(); }, 10);
      return node;
    };
  }
  const bump = () => w.localStorage.setItem('sivry.profile.updatedAt', String(Math.max(Date.now(), Number(w.localStorage.getItem('sivry.profile.updatedAt')) + 1)));
  w.fetch = async (url, options = {}) => {
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url === '/api/profile') {
      if (options.method === 'PUT') {
        profile = JSON.parse(options.body);
        bump();
        w.dispatchEvent(new w.Event('sivree:profile-saved'));
      }
      return json(profile);
    }
    const path = url.replace('https://www.googleapis.com', '');
    drive.calls.push(`${options.method || 'GET'} ${path.split('?')[0]}`);
    if (options.headers?.Authorization !== 'Bearer tok' || drive.revoked) return json({}, 401);
    if (path.startsWith('/drive/v3/files?')) {
      const files = path.includes('orderBy=modifiedTime%20desc') ? [...drive.files].sort((a, b) => b.modifiedTime - a.modifiedTime) : drive.files;
      return json({ files: files.map((file) => ({ id: file.id })) });
    }
    const id = path.match(/files\/([^?/]+)/)?.[1];
    const file = drive.files.find((f) => f.id === id);
    if (path.includes('alt=media')) return file ? json(file.content) : json({}, 404);
    if (options.method === 'DELETE') { drive.files = drive.files.filter((f) => f.id !== id); return json({}); }
    if (path.startsWith('/upload/')) {
      const raw = options.body;
      const content = JSON.parse(raw.includes('--sivree') ? raw.split('\r\n\r\n')[2].split('\r\n--')[0] : raw);
      if (file) { file.content = content; file.modifiedTime = ++drive.clock; return json({ id }); }
      const created = { id: `f${drive.files.length + 1}-${drive.clock}`, modifiedTime: ++drive.clock, content };
      drive.files.push(created);
      return json({ id: created.id });
    }
    return json({}, 404);
  };
  w.eval(source);
  const events = [];
  w.SivreeSync.on((event) => events.push(event.type));
  return {
    sync: w.SivreeSync,
    window: w,
    popups,
    events,
    get profile() { return profile; },
    edit(change) { profile = { ...profile, ...change }; bump(); },
    /** 押した操作の中で呼ぶ（その間だけログイン画面を開ける） */
    tap(fn) { gesture = true; try { return fn(); } finally { gesture = false; } },
    /** 同じ端末でページを開き直す（localStorage と設定はそのまま） */
    reload(options = {}) {
      const copy = {};
      for (let i = 0; i < w.localStorage.length; i++) copy[w.localStorage.key(i)] = w.localStorage.getItem(w.localStorage.key(i));
      return device({ storage: copy, profile, ...options });
    },
    storage: (key) => JSON.parse(w.localStorage.getItem(key))
  };
}

const entry = (id, savedAt = '2026-10-02T00:00:00.000Z') => ({ id: id.repeat(16), title: id, sourceName: 's', sourceType: 'official', subgroup: '', url: `https://example.test/${id}`, publishedAt: '2026-10-01T00:00:00.000Z', savedAt, note: '' });
const ids = (profile) => (profile.savedItems ?? []).map((e) => e.id[0]).sort().join('');
const tapSync = (d) => d.tap(() => d.sync.syncNow());

let a = device();
check('クライアント ID があれば利用可能になる', a.sync.available === true);
check('同期していない端末は、開いても Google と通信しない', (await a.sync.auto()) === null && a.popups.opened + a.popups.blocked === 0 && drive.calls.length === 0);

// ---------- ログイン画面は押した操作の中でだけ開く（iPhone の条件） ----------
await a.sync.syncNow().then(() => check('押した操作の外では開けない', false), (error) => check('押した操作の外では開けない（ポップアップは止められる）', error.message === 'popup' && a.popups.blocked === 1));
a.edit({ marker: 'from-A' });
check('A: 押すとログイン画面が開き、初回はドライブが空なので送信する', (await tapSync(a)) === 'push' && a.popups.opened === 1 && remote()?.profile.marker === 'from-A' && remote().rev === 1);

// Google のスクリプトをまだ読み込んでいない端末で初めて押したとき: 読み込みを待つ間に操作の扱いが切れたら、もう一度押してもらう
let b = device({ gis: false, profile: { regions: ['CA'], marker: 'b-onboarding', onboarded: true, savedItems: [entry('x')] } });
b.edit({});
let firstTap = 'none';
await b.tap(() => b.sync.connect()).catch((error) => { firstTap = error.message; });
check('B: スクリプトの読み込みを待った後は開けず、もう一度押すよう知らせる', firstTap === 'popup' && b.popups.opened === 0, firstTap);

// ---------- 初めて同期する端末は、確認なしにドライブの設定を使い、保存した記事は両方を残す ----------
check('B: 2 回目に押すと開き、ドライブの設定（A の設定）を取り込む', (await b.tap(() => b.sync.connect())) === 'pull' && b.popups.opened === 1 && b.profile.marker === 'from-A' && b.profile.regions.join() === 'JP', JSON.stringify(b.profile));
check('B: この端末だけにあった保存した記事は残り、ドライブにも上がる', ids(b.profile) === 'x' && ids(remote().profile) === 'x' && remote().rev === 2);
check('B: 取り込みの後は「読み込んだ」と知らせる（画面を読み込み直す合図）', b.events.includes('pulled'));
check('A: 許可が残っていれば、押してもログイン画面を出さずに取り込む', (await tapSync(a)) === 'pull' && a.popups.opened === 1 && ids(a.profile) === 'x');
check('A: 取り込んだ直後は変更なし', (await tapSync(a)) === 'none');

// ---------- 開き直しても許可は残る（約 1 時間） ----------
a = a.reload();
check('A: 開き直すと、ログイン画面を出さずに自動で同期する', (await a.sync.auto()) === 'none' && a.popups.opened + a.popups.blocked === 0 && a.sync.needsAuth() === false);
a.edit({ marker: 'auto' });
a.window.dispatchEvent(new a.window.Event('sivree:profile-saved'));
await sleep(3300);
check('A: 開き直した後も、設定を保存すると数秒後に自動で送信する', remote().profile.marker === 'auto');

// ---------- 2 台の変更は確認なしに合わせる ----------
await tapSync(b);
await sleep(5);
a.edit({ excludedSources: ['aaaaaaaaaa'] });
b.edit({ savedItems: [entry('y', '2026-10-03T00:00:00.000Z'), ...b.profile.savedItems] });
check('B: 自分だけが変更したので送信する', (await tapSync(b)) === 'push' && ids(remote().profile) === 'xy');
check('A: 情報源の変更（A）と保存した記事（B）の両方が残る', (await tapSync(a)) === 'pull' && a.profile.excludedSources.join() === 'aaaaaaaaaa' && ids(a.profile) === 'xy' && remote().profile.excludedSources.join() === 'aaaaaaaaaa', JSON.stringify(a.profile));
check('B: 次の同期で A の情報源の変更を受け取る', (await tapSync(b)) === 'pull' && b.profile.excludedSources.join() === 'aaaaaaaaaa');
check('統合した記事は新しい順', a.profile.savedItems.map((e) => e.id[0]).join('') === 'yx');

// 削除も伝わる（両方の端末が変えていても、消した記事は戻らない）
a.edit({ savedItems: a.profile.savedItems.filter((e) => e.id[0] !== 'x') });
b.edit({ savedItems: [entry('z', '2026-10-04T00:00:00.000Z'), ...b.profile.savedItems] });
await tapSync(a);
check('B: A が消した記事は消え、B が加えた記事は残る', (await tapSync(b)) === 'pull' && ids(b.profile) === 'yz' && ids(remote().profile) === 'yz', ids(b.profile));
check('A: 同じ結果になる', (await tapSync(a)) === 'pull' && ids(a.profile) === 'yz');
b.edit({ excludedSources: [] });
await tapSync(b);
check('A: 情報源をオンに戻したことも伝わる', (await tapSync(a)) === 'pull' && a.profile.excludedSources.length === 0);

// 同じ設定を両方で変えたら、後から変えたほうを使う
a.edit({ marker: 'A-first' });
await sleep(5);
b.edit({ marker: 'B-later' });
await tapSync(b);
check('A: 相手のほうが後に変えた設定は、相手のものになる', (await tapSync(a)) === 'pull' && a.profile.marker === 'B-later');
b.edit({ marker: 'B-first' });
await tapSync(b);
await sleep(5);
a.edit({ marker: 'A-later' });
check('A: 自分のほうが後に変えた設定は、自分のものになる', (await tapSync(a)) === 'push' && a.profile.marker === 'A-later' && remote().profile.marker === 'A-later');
check('B: それを受け取る', (await tapSync(b)) === 'pull' && b.profile.marker === 'A-later');

// 候補（既定ではオフの情報源）: 両方でオンにした候補はどちらも残り、候補を最後に見た日は新しい方
a.edit({ extraSources: ['aaaaaaaaaa'], candidatesSeenAt: '2026-10-22' });
b.edit({ extraSources: ['bbbbbbbbbb'], candidatesSeenAt: '2026-10-25' });
await tapSync(b);
check('A: 候補のオンは両方が残り、見た日は新しい方', (await tapSync(a)) === 'pull' && [...a.profile.extraSources].sort().join() === 'aaaaaaaaaa,bbbbbbbbbb' && a.profile.candidatesSeenAt === '2026-10-25', JSON.stringify([a.profile.extraSources, a.profile.candidatesSeenAt]));
await tapSync(b);
b.edit({ extraSources: ['bbbbbbbbbb'] });
await tapSync(b);
check('A: 相手が候補をオフにしたら、こちらでもオフになる', (await tapSync(a)) === 'pull' && a.profile.extraSources.join() === 'bbbbbbbbbb');

// ---------- 許可の期限切れ・取り消し ----------
const expired = a.reload();
const token = expired.storage('sivree:sync-token');
expired.window.localStorage.setItem('sivree:sync-token', JSON.stringify({ ...token, expiresAt: Date.now() - 1 }));
check('期限が切れていたら、開いても Google の画面は出さず、同期ボタンを出す合図をする', (await expired.sync.auto()) === null && expired.popups.opened + expired.popups.blocked === 0 && expired.sync.needsAuth() && expired.events.includes('needs-auth'));
const callsBefore = drive.calls.length;
expired.edit({ marker: 'offline-edit' });
expired.window.dispatchEvent(new expired.window.Event('sivree:profile-saved'));
await sleep(50);
check('期限切れの間に保存しても送信はしない', drive.calls.length === callsBefore);
check('同期ボタンを押すと許可を取り直し、待っていた変更を送信する', (await tapSync(expired)) === 'push' && expired.popups.opened === 1 && remote().profile.marker === 'offline-edit' && !expired.sync.needsAuth());
a = expired;
drive.revoked = true;
check('別の端末で許可が取り消されたら、自動の同期は止まり、同期ボタンを出す', (await a.sync.auto()) === null && a.sync.needsAuth());
drive.revoked = false;
check('押すと許可を取り直して続ける', (await tapSync(a)) === 'none' && !a.sync.needsAuth());
drive.scope = 'openid';
const noScope = a.reload();
noScope.window.localStorage.removeItem('sivree:sync-token');
await noScope.tap(() => noScope.sync.syncNow()).then(() => check('ドライブへのアクセスが許可されなかったら知らせる', false), (error) => check('ドライブへのアクセスが許可されなかったら知らせる', error.message === 'scope'));
drive.scope = SCOPE;

// ---------- アプリに戻ったときに、別の端末での変更を取り込む ----------
b.edit({ marker: 'while-away' });
await tapSync(b);
a.window.localStorage.setItem('sivry:sync', JSON.stringify({ ...a.storage('sivry:sync'), lastAt: Date.now() - 120000 }));
a.window.document.dispatchEvent(new a.window.Event('visibilitychange'));
await sleep(100);
check('戻ったときに自動で取り込む', a.profile.marker === 'while-away');

// ---------- 前の版で同期していた端末 ----------
const legacyRemote = remote();
const legacy = device({
  storage: {
    'sivry:sync': JSON.stringify({ enabled: true, baseRev: legacyRemote.rev, syncedAt: 1, lastAt: 1 }),
    'sivree:sync-token': JSON.stringify({ value: 'tok', expiresAt: Date.now() + 3600000 }),
    'sivry.profile.updatedAt': String(Date.now())
  },
  profile: { ...legacyRemote.profile, marker: 'legacy-unsent' }
});
check('前の版の端末: 送れていなかった変更は、ドライブが変わっていなければそのまま送る', (await legacy.sync.auto()) === 'push' && remote().profile.marker === 'legacy-unsent');
await tapSync(b);

// ---------- ドライブに設定ファイルが 2 つあるとき ----------
drive.files.unshift({ id: 'stale', modifiedTime: -1, content: { rev: 99, savedAt: '2026-01-01T00:00:00.000Z', profile: { marker: 'stale' } } });
const c = device({ profile: { marker: 'c' } });
check('ファイルが複数あれば、最後に更新されたものを使う（どの端末でも同じものを選ぶ）', (await tapSync(c)) === 'pull' && c.profile.marker === b.profile.marker, c.profile.marker);

// ---------- 削除・同期をやめる ----------
await c.sync.deleteRemote();
check('ドライブの保存データを削除できる（重複したファイルも含む）', drive.files.length === 0);
await c.sync.disconnect();
check('同期をやめると状態と許可を消す', c.window.localStorage.getItem('sivry:sync') === null && c.window.localStorage.getItem('sivree:sync-token') === null && c.window.localStorage.getItem('sivree:sync-base') === null);
check('同期をやめた端末は自動同期しない', (await c.sync.auto()) === null && !c.sync.needsAuth());
check('サーバー（Sivree）への通信はない: 通信先は /api/profile と Google のみ', drive.calls.every((call) => /\/(drive|upload)\//.test(call)));

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
