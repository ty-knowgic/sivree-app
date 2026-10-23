// 端末間の設定の同期。設定は Sivree のサーバーには送らず、利用者自身の Google ドライブにある
// このアプリ専用の非表示フォルダ（appDataFolder）に 1 つのファイルとして置く。
// Google へのログインは「そのフォルダにアクセスする許可」を得るためだけに使う（スコープは drive.appdata のみ）。
// 利用者が「Google でログインして同期」を押すまで、Google とは一切通信しない。
// CLIENT_ID が空のあいだは、同期の項目自体を表示しない。
//
// 許可（アクセストークン）は、利用者がボタンを押したときにだけ Google のログイン画面（ポップアップ）で受け取る。
// iPhone の Safari などは、押した操作の中ですぐに開かないポップアップを止めるので、同期が有効なら Google のスクリプトを
// 先に読み込んでおき、押したら待たずに開く。押さずに許可を取り直す方法を Google は用意していないため、
// トークン（約 1 時間有効）は開き直しても使えるようこの端末に保存し、期限が切れたら画面上部の同期ボタンで取り直す。
(function () {
  // Google Cloud の OAuth クライアント ID（ウェブ）。公開してよい値で、秘密ではない
  const CLIENT_ID = '244005834281-2h0uvdit4i48fc3jjj5hpjgpte8emmra.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'sivry-settings.json';
  const STATE_KEY = 'sivry:sync';
  /** アクセストークンとその期限 */
  const TOKEN_KEY = 'sivree:sync-token';
  /** 前回の同期でドライブにあった設定（2 台の変更を合わせるときの基準） */
  const BASE_KEY = 'sivree:sync-base';
  const UPDATED_KEY = 'sivry.profile.updatedAt';
  const DRIVE = 'https://www.googleapis.com';
  const PUSH_DELAY = 3000;
  /** アプリに戻ったとき、前回の同期からこれだけ経っていればドライブを確かめる */
  const RECHECK_AFTER = 60 * 1000;
  const MAX_ATTEMPTS = 5;
  /** 一覧の上限（src/profile.ts の ProfileSchema と同じ値） */
  const LIMITS = { excludedSources: 500, extraSources: 200, hiddenItems: 300, savedItems: 1000 };

  let client = null;
  let gisLoading = null;
  /** ログイン画面の結果を待っている要求 */
  let pending = null;
  let queue = Promise.resolve();
  let applying = false;
  let pushTimer = 0;
  let expiryTimer = 0;
  let generation = 0;
  const listeners = [];

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }
  function write(key, value) {
    try {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
      return true;
    } catch {
      // 保存できない場合、同期の状態は今回の表示だけになる
      return false;
    }
  }
  const readState = () => read(STATE_KEY) || {};
  const writeState = (state) => write(STATE_KEY, state);
  function localUpdatedAt() {
    try {
      return Number(localStorage.getItem(UPDATED_KEY)) || 0;
    } catch {
      return 0;
    }
  }
  function notify(event) {
    listeners.forEach((fn) => { try { fn(event); } catch { /* 表示側の失敗で同期を止めない */ } });
  }

  // ---------- Google の許可 ----------

  /** 期限内のアクセストークン（期限の 1 分前からは使わない） */
  function currentToken() {
    const saved = read(TOKEN_KEY);
    return saved?.value && Date.now() < saved.expiresAt ? saved.value : null;
  }
  function watchExpiry() {
    clearTimeout(expiryTimer);
    const saved = read(TOKEN_KEY);
    if (!saved?.expiresAt || !readState().enabled) return;
    expiryTimer = setTimeout(() => notify({ type: 'needs-auth' }), Math.max(0, saved.expiresAt - Date.now()));
  }
  function storeToken(response) {
    write(TOKEN_KEY, { value: response.access_token, expiresAt: Date.now() + (Number(response.expires_in) - 60) * 1000 });
    watchExpiry();
  }
  function dropToken() {
    write(TOKEN_KEY, null);
    clearTimeout(expiryTimer);
  }
  function authError() {
    dropToken();
    notify({ type: 'needs-auth' });
    return new Error('auth');
  }

  function settle(error) {
    const waiting = pending;
    pending = null;
    if (waiting) error ? waiting.reject(error) : waiting.resolve();
  }
  function createClient() {
    if (client || !window.google?.accounts?.oauth2) return;
    const oauth2 = window.google.accounts.oauth2;
    client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) return settle(new Error(response.error || 'auth'));
        // 同意画面でドライブへのアクセスの欄を外されたら、そのトークンではドライブを読めない
        if (oauth2.hasGrantedAllScopes && !oauth2.hasGrantedAllScopes(response, SCOPE)) return settle(new Error('scope'));
        storeToken(response);
        settle(null);
      },
      error_callback: (error) => settle(new Error(error?.type === 'popup_failed_to_open' ? 'popup' : error?.type || 'auth'))
    });
  }
  function loadGis() {
    createClient();
    if (client) return Promise.resolve();
    gisLoading ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => { createClient(); resolve(); };
      script.onerror = () => { gisLoading = null; script.remove(); reject(new Error('gis-load')); };
      document.head.appendChild(script);
    });
    return gisLoading;
  }
  function openPopup() {
    if (!client) return Promise.reject(new Error('gis-load'));
    // 前に開いた画面が閉じられないまま、もう一度押された場合は、前の要求を終わらせる（待ち続けない）
    settle(new Error('superseded'));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      client.requestAccessToken({ prompt: '' });
    });
  }
  /**
   * 許可を得る。押した操作の中から、間に await を挟まずに呼ぶこと（挟むと、iPhone ではログイン画面が開かない）。
   * 期限内のトークンがあれば Google には問い合わせない
   */
  function authorize() {
    if (currentToken()) return Promise.resolve();
    createClient();
    if (client) return openPopup();
    // この端末で初めて押したとき: スクリプトを読み込んでから開く。読み込む間に押した操作の扱いが切れたら、もう一度押してもらう
    return loadGis().then(() => {
      if (navigator.userActivation && !navigator.userActivation.isActive) throw new Error('popup');
      return openPopup();
    });
  }

  // ---------- ドライブ ----------

  async function drive(path, options = {}) {
    const token = currentToken();
    if (!token) throw authError();
    const response = await fetch(DRIVE + path, { ...options, signal: AbortSignal.timeout(30000), headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    if (response.status === 401) throw authError();
    if (!response.ok) throw new Error(`drive-${response.status}`);
    return response;
  }

  /** 設定のファイルを全ページ読む。初回の同時作成で複数ある場合も統合対象にする */
  async function listFiles() {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const ids = [];
    let page = '';
    do {
      const list = await drive(`/drive/v3/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&pageSize=1000&fields=nextPageToken,files(id)${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`).then((r) => r.json());
      ids.push(...(list.files ?? []).map((file) => file.id));
      page = list.nextPageToken || '';
    } while (page);
    return ids;
  }

  // v2 exposes the file ETag in JSON (not a CORS-dependent response header).
  // Read it on both sides of the media GET so it always describes that body.
  async function readFile(id) {
    const tag = () => drive(`/drive/v2/files/${id}?fields=etag`).then(r => r.json());
    const before = await tag();
    const data = await drive(`/drive/v3/files/${id}?alt=media`).then(r => r.json());
    const after = await tag();
    if (!before.etag || before.etag !== after.etag) throw new Error('drive-412');
    if (!data || typeof data.profile !== 'object' || !data.profile || Array.isArray(data.profile)) throw new Error('invalid-remote');
    return { id, data, etag: after.etag };
  }

  async function readRemote() {
    const ids = await listFiles();
    if (!ids.length) return { id: null, data: null, absorbed: {} };
    // A stable canonical ID prevents two first-time devices choosing different files.
    const id = [...ids].sort()[0];
    const canonical = await readFile(id);
    const absorbed = { ...canonical.data.absorbed };
    let profile = canonical.data.profile;
    let consolidated = false;
    for (const otherId of ids.filter(value => value !== id)) {
      const other = await readFile(otherId);
      if (absorbed[otherId] === other.etag) continue;
      profile = (canonical.data.savedAt || '') >= (other.data.savedAt || '')
        ? mergeProfiles(null, other.data.profile, profile, false)
        : mergeProfiles(null, profile, other.data.profile, false);
      absorbed[otherId] = other.etag;
      consolidated = true;
    }
    // Keep duplicates as recovery copies; their ETags prevent deleted items resurfacing.
    return { ...canonical, data: { ...canonical.data, profile }, absorbed, consolidated };
  }

  /** 書き込んで、ファイルの ID を返す */
  async function writeRemote(id, content, etag) {
    const body = JSON.stringify(content);
    if (id) {
      if (!etag) throw new Error('invalid-remote');
      await drive(`/upload/drive/v2/files/${id}?uploadType=media`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body });
      return id;
    }
    const boundary = `sivree${Date.now()}`;
    const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const created = await drive('/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }).then((r) => r.json());
    if (!created.id) throw new Error('invalid-remote');
    return created.id;
  }

  // ---------- 2 台の変更を合わせる ----------
  // 前回の同期でドライブにあった設定（base）と比べて、この端末とドライブのそれぞれで何が変わったかを項目ごとに見る。
  // 片方だけが変えた項目はその変更を使い、両方が同じ項目を変えたときは後から変えたほうを使う。
  // 一覧（情報源のオン・オフ、非表示にした記事、保存した記事）は要素ごとに、両方の追加と削除を反映する。
  // base がないとき（この端末で初めて同期する、または前の版で同期していた）は、設定（情報源のオン・オフを含む）は
  // ドライブのものを使い、非表示にした記事と保存した記事は両方を残す。

  /** 項目の並びに左右されない比較のための文字列 */
  const stable = (value) => JSON.stringify(value ?? null, (key, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
    : v));
  const same = (a, b) => stable(a) === stable(b);

  function pickValue(hasBase, base, local, remote, laterLocal) {
    if (remote === undefined || same(local, remote) || (hasBase && same(remote, base))) return local;
    if (!hasBase || same(local, base)) return remote;
    if ([base, local, remote].every(value => value && typeof value === 'object' && !Array.isArray(value))) {
      return Object.fromEntries([...new Set([...Object.keys(local), ...Object.keys(remote)])]
        .map(key => [key, pickValue(true, base[key], local[key], remote[key], laterLocal)]));
    }
    return laterLocal ? local : remote;
  }

  function mergeList(hasBase, base, local, remote, laterLocal, keyOf = (item) => item) {
    const index = (list) => new Map((Array.isArray(list) ? list : []).map((item) => [keyOf(item), item]));
    const [b, l, r] = [index(base), index(local), index(remote)];
    const merged = [];
    for (const key of new Set([...r.keys(), ...l.keys()])) {
      const inBase = hasBase && b.has(key);
      if (l.has(key) && r.has(key)) merged.push(pickValue(inBase, b.get(key), l.get(key), r.get(key), laterLocal));
      // 片方にしかない: 前回あったなら、もう片方で消された。なかったなら、こちらで加えた
      else if (!inBase) merged.push(l.get(key) ?? r.get(key));
    }
    return merged;
  }

  function mergeProfiles(base, local, remote, laterLocal) {
    const hasBase = Boolean(base);
    const merged = {};
    for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
      merged[key] = pickValue(hasBase, base?.[key], local[key], remote[key], laterLocal);
    }
    const list = (key, keyOf) => mergeList(hasBase, base?.[key], local[key], remote[key], laterLocal, keyOf);
    if (hasBase) {
      merged.excludedSources = list('excludedSources').slice(0, LIMITS.excludedSources);
      merged.extraSources = list('extraSources').slice(0, LIMITS.extraSources);
      merged.topics = list('topics', item => item.id);
    }
    // 非表示にした記事は新しいものが後ろ。上限を超えたら古いものから外す
    merged.hiddenItems = list('hiddenItems').slice(-LIMITS.hiddenItems);
    merged.savedItems = list('savedItems', (item) => item.id)
      .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
      .slice(0, LIMITS.savedItems);
    // 候補を最後に見た日は新しい方（どちらの端末で見ても、見た候補を「新しい」と出さない）
    merged.candidatesSeenAt = [local.candidatesSeenAt, remote.candidatesSeenAt].filter(Boolean).sort().pop() ?? '';
    return merged;
  }

  // ---------- 同期 ----------

  function run(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }

  async function localSnapshot() {
    const response = await fetch('/api/profile');
    if (!response.ok) throw new Error('local-read');
    const version = response.headers?.get('X-Sivree-Profile-Version') ?? String(localUpdatedAt());
    return { profile: await response.json(), version, updatedAt: Number(version) };
  }
  /** この端末の設定を書き換え、保存された設定（形式の補正後）を返す */
  async function applyLocal(profile, version) {
    applying = true;
    try {
      const response = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Sivree-Profile-Version': version }, body: JSON.stringify(profile) });
      if (response.status === 409) throw new Error('local-conflict');
      if (!response.ok) throw new Error('invalid-remote');
      const savedVersion = response.headers?.get('X-Sivree-Profile-Version') ?? String(localUpdatedAt());
      return { profile: await response.json(), updatedAt: Number(savedVersion) };
    } finally {
      applying = false;
    }
  }

  /**
   * ドライブと突き合わせる。版番号（rev）とファイルで「前回の同期の後にドライブが変わったか」、
   * この端末の更新時刻で「この端末が変わったか」を判断する。片方だけなら新しい側に揃え、両方なら合わせる。
   * 結果: 'pull'（この端末の設定が変わった。ドライブも更新した場合を含む）・'push'（ドライブだけを更新）・'none'
   */
  function sync(interactive) {
    const epoch = generation;
    return run(async () => {
      try {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          if (epoch !== generation) throw new Error('superseded');
          const state = readState();
          let remote;
          try { remote = await readRemote(); } catch (error) {
            if (['drive-412', 'drive-404'].includes(error.message)) continue;
            throw error;
          }
          const snapshot = await localSnapshot();
          const startedAt = snapshot.updatedAt;
          const dirty = startedAt > (state.syncedAt || 0);
          const remoteRev = remote.data?.rev || 0;
          const savedBase = read(BASE_KEY);
          const base = savedBase && savedBase.fileId === remote.id && savedBase.rev === state.baseRev ? savedBase.profile : null;
          // Compare the content as well: an old client can reuse a revision number.
          const remoteChanged = Boolean(remote.data) && (remoteRev !== state.baseRev || (Boolean(state.fileId) && remote.id !== state.fileId) || (Boolean(base) && !same(remote.data.profile, base)));

          let local = snapshot.profile;
          if (remote.data && remoteChanged && !dirty) {
            local = remote.data.profile;
          } else if (remote.data && remoteChanged) {
            const laterLocal = startedAt > (Date.parse(remote.data.savedAt) || 0);
            local = mergeProfiles(base, local, remote.data.profile, laterLocal);
          }

          const needsPush = !remote.data || remote.consolidated || (dirty && !same(local, remote.data.profile));
          let fileId = remote.id;
          let rev = remoteRev;
          let remoteSavedAt = remote.data?.savedAt ?? null;
          if (needsPush) {
            if (epoch !== generation) throw new Error('superseded');
            rev = Math.max(remoteRev, state.baseRev || 0) + 1;
            remoteSavedAt = new Date().toISOString();
            try {
              fileId = await writeRemote(remote.id, { rev, savedAt: remoteSavedAt, profile: local, absorbed: remote.absorbed }, remote.etag);
            } catch (error) {
              if (['drive-412', 'drive-404'].includes(error.message)) continue;
              throw error;
            }
          }
          if (epoch !== generation) throw new Error('superseded');
          // Do not replace edits made during the network request. Rebase only the
          // incoming delta onto the latest profile, then conditionally save it.
          let acknowledgedAt = startedAt;
          let changedLocal = false;
          if (!same(local, snapshot.profile)) {
            const latest = await localSnapshot();
            const rebased = mergeProfiles(snapshot.profile, latest.profile, local, true);
            const editedDuringSync = !same(latest.profile, snapshot.profile);
            let applied;
            try { applied = await applyLocal(rebased, latest.version); } catch (error) {
              if (error.message === 'local-conflict') continue;
              throw error;
            }
            changedLocal = true;
            if (!editedDuringSync) acknowledgedAt = applied.updatedAt;
          }
          // 次に合わせるときの基準は、いまドライブにある設定そのもの
          if (!write(BASE_KEY, { fileId, rev, profile: needsPush ? local : remote.data.profile })) throw new Error('local-save');
          if (!writeState({
            enabled: true,
            fileId,
            baseRev: rev,
            syncedAt: acknowledgedAt,
            lastAt: Date.now(),
            remoteSavedAt,
            error: null
          })) throw new Error('local-save');
          watchExpiry();
          const action = changedLocal ? 'pull' : needsPush ? 'push' : 'none';
          if (changedLocal) notify({ type: 'pulled', interactive });
          notify({ type: action });
          if (localUpdatedAt() > acknowledgedAt) schedulePush();
          return action;
        }
        throw new Error('conflict');
      } catch (error) {
        if (epoch === generation) {
          writeState({ ...readState(), error: true });
          notify({ type: 'error' });
        }
        throw error;
      }
    });
  }

  function background() {
    return sync(false).catch(() => null);
  }

  /** 押した操作から呼ぶ。許可がなければログイン画面を開いてから同期する */
  function syncFromTap() {
    return authorize().then(() => sync(true));
  }

  async function disconnect() {
    generation++;
    const token = currentToken();
    if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
    dropToken();
    clearTimeout(pushTimer);
    writeState(null);
    write(BASE_KEY, null);
    notify({ type: 'disconnected' });
  }

  /** ドライブにある設定ファイルを消す（この端末の設定は残る）。押した操作から呼ぶ */
  function deleteRemote() {
    return authorize().then(() => run(async () => {
      for (const id of await listFiles()) await drive(`/drive/v3/files/${id}`, { method: 'DELETE' });
      writeState({ ...readState(), fileId: null, baseRev: 0, syncedAt: 0, remoteSavedAt: null });
      write(BASE_KEY, null);
      notify({ type: 'deleted' });
    }));
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    notify({ type: 'pending' });
    pushTimer = setTimeout(() => { pushTimer = 0; background(); }, PUSH_DELAY);
  }

  // 設定を保存したら、少し待ってからドライブに反映する。許可が切れていれば、同期ボタンを出してもらう
  window.addEventListener('sivree:profile-saved', () => {
    if (applying || !readState().enabled) return;
    if (!currentToken()) return notify({ type: 'needs-auth' });
    schedulePush();
  });

  // アプリに戻ったら、別の端末での変更を取り込む。離れるときは、待っている送信をすぐに行う（iPhone は裏に回ったページを止めるため）
  document.addEventListener('visibilitychange', () => {
    const state = readState();
    if (!state.enabled) return;
    if (document.visibilityState === 'hidden') {
      if (pushTimer && currentToken()) { clearTimeout(pushTimer); pushTimer = 0; background(); }
      return;
    }
    if (!currentToken()) return notify({ type: 'needs-auth' });
    if (Date.now() - (state.lastAt || 0) > RECHECK_AFTER) background();
  });

  window.SivreeSync = {
    available: Boolean(CLIENT_ID),
    state: readState,
    /** 同期は有効だが、Google の許可が切れている（押すまで同期できない） */
    needsAuth: () => Boolean(readState().enabled) && !currentToken(),
    needsSync: () => Boolean(readState().enabled) && (Boolean(readState().error) || localUpdatedAt() > (readState().syncedAt || 0)),
    connect: syncFromTap,
    syncNow: syncFromTap,
    /**
     * 設定の保存・貼り付けなど、設定を変える押した操作の中で、保存より前に呼ぶ。
     * 同期が有効で許可が切れていれば、ここでログイン画面を開き、許可が取れたら保存した変更をドライブに送る
     */
    prepare: () => {
      if (!readState().enabled || currentToken()) return;
      authorize().then(background, () => notify({ type: 'needs-auth' }));
    },
    /** ページを開いたとき。許可が残っていれば画面を出さずに同期する。Google のスクリプトは、押したらすぐ開けるよう先に読み込む */
    auto: () => {
      if (!readState().enabled) return Promise.resolve(null);
      loadGis().catch(() => {});
      watchExpiry();
      if (!currentToken()) {
        notify({ type: 'needs-auth' });
        return Promise.resolve(null);
      }
      return background();
    },
    disconnect,
    deleteRemote,
    on: (fn) => listeners.push(fn)
  };
})();
