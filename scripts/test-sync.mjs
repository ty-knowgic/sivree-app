// Google ドライブ同期（public/sync.js）の判断ロジックを、偽の Drive と偽の Google ログインで確かめる。
// 実際の Google とは通信しない。2 台の端末は、別々の localStorage と別々の window で表す。
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = (await readFile(new URL('../public/sync.js', import.meta.url), 'utf8')).replace("const CLIENT_ID = '';", "const CLIENT_ID = 'test-client';");
const savedSource = await readFile(new URL('../public/saved.js', import.meta.url), 'utf8');
const drive = { file: null, calls: [] }; // 共有のドライブ（appDataFolder の 1 ファイル）
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failures++; };

function device() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  let profile = { regions: ['JP'], marker: 'initial' };
  w.google = { accounts: { oauth2: {
    initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.callback({ access_token: 'tok', expires_in: 3600 }) }),
    revoke: () => {}
  } } };
  w.fetch = async (url, options = {}) => {
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (url === '/api/profile') {
      if (options.method === 'PUT') {
        profile = JSON.parse(options.body);
        w.localStorage.setItem('sivry.profile.updatedAt', String(Math.max(Date.now(), Number(w.localStorage.getItem('sivry.profile.updatedAt')) + 1)));
        w.dispatchEvent(new w.Event('sivree:profile-saved'));
      }
      return json(profile);
    }
    drive.calls.push(`${options.method || 'GET'} ${url.replace('https://www.googleapis.com', '').split('?')[0]}`);
    if (options.headers?.Authorization !== 'Bearer tok') return json({}, 401);
    if (url.includes('alt=media')) return json(drive.file);
    if (url.includes('/drive/v3/files?') && !url.includes('/upload/')) return json({ files: drive.file ? [{ id: 'f1' }] : [] });
    if (options.method === 'DELETE') { drive.file = null; return json({}); }
    if (url.includes('/upload/')) {
      const raw = options.body;
      drive.file = JSON.parse(raw.includes('--sivree') ? raw.split('\r\n\r\n')[2].split('\r\n--')[0] : raw);
      return json({ id: 'f1' });
    }
    return json({}, 404);
  };
  w.eval(savedSource);
  w.eval(source);
  return {
    sync: w.SivreeSync,
    get profile() { return profile; },
    edit(change) { profile = { ...profile, ...change }; w.localStorage.setItem('sivry.profile.updatedAt', String(Math.max(Date.now(), Number(w.localStorage.getItem('sivry.profile.updatedAt')) + 1))); },
    window: w
  };
}

const a = device();
const b = device();
check('クライアント ID があれば利用可能になる', a.sync.available === true);

a.edit({ marker: 'from-A' });
check('A: 初回はドライブが空なので送信する', (await a.sync.connect()) === 'push' && drive.file?.profile.marker === 'from-A' && drive.file.rev === 1);

check('B: 未変更の端末は、ドライブの設定を取り込む', (await b.sync.connect()) === 'pull' && b.profile.marker === 'from-A');
check('B: 取り込んだ直後は変更なしと判断する', (await b.sync.syncNow()) === 'none');

b.edit({ marker: 'from-B' });
check('B: 自分だけが変更したら送信する（版が 2 になる）', (await b.sync.syncNow()) === 'push' && drive.file.rev === 2);
check('A: 相手だけが変更したら取り込む', (await a.sync.syncNow()) === 'pull' && a.profile.marker === 'from-B');

a.edit({ marker: 'A-again' });
b.edit({ marker: 'B-again' });
await b.sync.syncNow();
let asked = 0;
check('A: 両方が変更していたら利用者に確認する（キャンセルで自分の設定を送信）', (await a.sync.syncNow(() => { asked++; return false; })) === 'push' && asked === 1 && drive.file.profile.marker === 'A-again');
a.edit({ marker: 'A-third' });
b.edit({ marker: 'B-third' });
await a.sync.syncNow();
check('B: 競合で OK を選ぶとドライブの設定を使う', (await b.sync.syncNow(() => true)) === 'pull' && b.profile.marker === 'A-third');

// 保存した記事は、競合のときも両方の端末のものを残す（設定は選んだほうを使うが、記事は失わない）
const entry = (id, savedAt) => ({ id: id.repeat(16), title: id, sourceName: 's', sourceType: 'official', subgroup: '', url: `https://example.test/${id}`, publishedAt: '2026-10-01T00:00:00.000Z', savedAt, note: '' });
const ids = (profile) => (profile.savedItems ?? []).map((e) => e.id[0]).sort().join('');
await a.sync.syncNow();
await b.sync.syncNow();
a.edit({ savedItems: [entry('a', '2026-10-02T00:00:00.000Z')] });
b.edit({ savedItems: [entry('b', '2026-10-03T00:00:00.000Z')] });
check('B: 自分だけが変更したので送信する', (await b.sync.syncNow()) === 'push' && ids(drive.file.profile) === 'b');
check('A: 競合でドライブ側を選んでも、この端末だけの保存した記事は残り、ドライブにも反映される', (await a.sync.syncNow(() => true)) === 'pull' && ids(a.profile) === 'ab' && ids(drive.file.profile) === 'ab', [ids(a.profile), ids(drive.file.profile)]);
check('B: 次の同期で両方を受け取る', (await b.sync.syncNow()) === 'pull' && ids(b.profile) === 'ab');
a.edit({ savedItems: [...a.profile.savedItems, entry('c', '2026-10-04T00:00:00.000Z')] });
b.edit({ savedItems: [...b.profile.savedItems, entry('d', '2026-10-05T00:00:00.000Z')] });
await b.sync.syncNow();
check('A: 競合でこの端末を選んでも、相手の保存した記事は残る（この端末にもドライブにも）', (await a.sync.syncNow(() => false)) === 'push' && ids(a.profile) === 'abcd' && ids(drive.file.profile) === 'abcd', [ids(a.profile), ids(drive.file.profile)]);
check('統合した記事は新しい順', a.profile.savedItems.map((e) => e.id[0]).join('') === 'dcba', a.profile.savedItems.map((e) => e.id[0]).join(''));
await b.sync.syncNow();

// 候補（既定ではオフの情報源）: オンにした候補（extraSources）は競合のとき選んだ側に揃え、候補を最後に見た日（candidatesSeenAt）は新しい方を使う
a.edit({ extraSources: ['aaaaaaaaaa'], candidatesSeenAt: '2026-10-22' });
b.edit({ extraSources: ['bbbbbbbbbb'], candidatesSeenAt: '2026-10-25' });
await b.sync.syncNow();
check('A: 競合でドライブ側を選ぶと、候補のオンはドライブ側（B）のものになり、見た日は新しい方', (await a.sync.syncNow(() => true)) === 'pull' && a.profile.extraSources.join() === 'bbbbbbbbbb' && a.profile.candidatesSeenAt === '2026-10-25', JSON.stringify([a.profile.extraSources, a.profile.candidatesSeenAt]));
await b.sync.syncNow();
a.edit({ extraSources: ['aaaaaaaaaa', 'cccccccccc'], candidatesSeenAt: '2026-10-23' });
b.edit({ extraSources: [], candidatesSeenAt: '2026-10-28' });
await b.sync.syncNow();
check('A: 競合でこの端末を選ぶと、候補のオンはこの端末のままで、見た日は新しい方（B の日付）',
  (await a.sync.syncNow(() => false)) === 'push' && a.profile.extraSources.join() === 'aaaaaaaaaa,cccccccccc' && a.profile.candidatesSeenAt === '2026-10-28' && drive.file.profile.candidatesSeenAt === '2026-10-28',
  JSON.stringify([a.profile.extraSources, a.profile.candidatesSeenAt, drive.file.profile.candidatesSeenAt]));
await b.sync.syncNow();
b.edit({ extraSources: ['dddddddddd'] });
check('B: 自分だけが変更したら、候補のオンも送信する', (await b.sync.syncNow()) === 'push' && drive.file.profile.extraSources.join() === 'dddddddddd');
check('A: 相手だけが変更したら、候補のオンも取り込む', (await a.sync.syncNow()) === 'pull' && a.profile.extraSources.join() === 'dddddddddd');

// 保存すると、数秒後に自動で送信される（トークンがあるとき）
b.edit({ marker: 'auto' });
b.window.dispatchEvent(new b.window.Event('sivree:profile-saved'));
await new Promise((r) => setTimeout(r, 3300));
check('B: 設定の保存後に自動で送信する', drive.file.profile.marker === 'auto');

await b.sync.deleteRemote();
check('ドライブの保存データを削除できる', drive.file === null);
await b.sync.disconnect();
check('同期をやめると状態を消す', b.window.localStorage.getItem('sivry:sync') === null);
check('同期をやめた端末は自動同期しない', (await b.sync.auto()) === null);
check('サーバー（Sivree）への通信はない: 通信先は /api/profile と Google のみ', drive.calls.every((c) => /\/(drive|upload)\//.test(c)));

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
