// 端末間の設定の同期。設定は Sivree のサーバーには送らず、利用者自身の Google ドライブにある
// このアプリ専用の非表示フォルダ（appDataFolder）に 1 つのファイルとして置く。
// Google へのログインは「そのフォルダにアクセスする許可」を得るためだけに使う（スコープは drive.appdata のみ）。
// 利用者が「Google でログインして同期」を押すまで、Google とは一切通信しない。
// CLIENT_ID が空のあいだは、同期の項目自体を表示しない。
// Google の許可（アクセストークン）は、利用者のタップの中でしか取れない（ポップアップで取るため、
// タップ以外で開くとブラウザに止められる）。そのため、ページを開いたときに画面を出さずに取ることはせず、
// 取ったトークンを有効なあいだ（約 1 時間）このタブに残して、読み込み直しても同期を続けられるようにする。
(function () {
  // Google Cloud の OAuth クライアント ID（ウェブ）。公開してよい値で、秘密ではない
  const CLIENT_ID = '244005834281-2h0uvdit4i48fc3jjj5hpjgpte8emmra.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'sivry-settings.json';
  const STATE_KEY = 'sivry:sync';
  const UPDATED_KEY = 'sivry.profile.updatedAt';
  const TOKEN_KEY = 'sivree:sync-token';
  const DRIVE = 'https://www.googleapis.com';
  const PUSH_DELAY = 3000;
  const TOKEN_TIMEOUT = 180000;

  let token = null;
  let tokenExpiry = 0;
  let pendingToken = null;
  let queue = Promise.resolve();
  let applying = false;
  let pushTimer = 0;
  /** 両方の端末で変更があったとき、利用者に選んでもらう関数（app.js から受け取る）。自動の送信でも使う */
  let conflictResolver = null;
  const listeners = [];

  // このタブで取ったトークン（sessionStorage はタブを閉じると消える）。スコープは drive.appdata のみ
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    if (saved?.token && Date.now() < saved.expiry) {
      token = saved.token;
      tokenExpiry = saved.expiry;
    }
  } catch {
    // 読めない場合は、次のタップで取り直す
  }
  function setToken(value, expiry) {
    token = value;
    tokenExpiry = expiry;
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: value, expiry }));
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // 保存できない場合、トークンはこのページを開いているあいだだけになる
    }
  }
  const hasToken = () => Boolean(token) && Date.now() < tokenExpiry;

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function writeState(state) {
    try {
      if (state) localStorage.setItem(STATE_KEY, JSON.stringify(state));
      else localStorage.removeItem(STATE_KEY);
    } catch {
      // 保存できない場合、同期の状態は今回の表示だけになる
    }
  }
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

  // 開いたときの先読みとタップが重なっても、スクリプトは 1 回だけ読み込む
  let gisLoading = null;
  function loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    gisLoading ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { gisLoading = null; script.remove(); reject(new Error('gis-load')); };
      document.head.appendChild(script);
    });
    return gisLoading;
  }

  function requestToken() {
    return new Promise((resolve, reject) => {
      // ポップアップが閉じられても知らせが来ない場合に、同期の順番待ちが止まったままにならないようにする
      setTimeout(() => reject(new Error('auth-timeout')), TOKEN_TIMEOUT);
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (!response.access_token) return reject(new Error(response.error || 'auth'));
          setToken(response.access_token, Date.now() + (Number(response.expires_in) - 60) * 1000);
          resolve(token);
        },
        error_callback: (error) => reject(new Error(error?.type || 'auth'))
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  /**
   * アクセストークン（約 1 時間有効）。interactive=true はタップの処理の中から呼ぶ。
   * Google のスクリプトが読み込み済みなら、待たずにその場でポップアップを開く（待つとブラウザに止められることがある）。
   * interactive=false のときは、有効なトークンか取得中のものがある場合だけ使い、なければ needs-tap で失敗する
   */
  function getToken(interactive) {
    if (hasToken()) return Promise.resolve(token);
    if (pendingToken) return pendingToken;
    if (!interactive) return Promise.reject(new Error('needs-tap'));
    const request = window.google?.accounts?.oauth2 ? requestToken() : loadGis().then(requestToken);
    pendingToken = request.finally(() => { pendingToken = null; });
    return pendingToken;
  }

  async function drive(path, options = {}) {
    const response = await fetch(DRIVE + path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } });
    if (response.status === 401) setToken(null, 0);
    if (!response.ok) throw new Error(`drive-${response.status}`);
    return response;
  }

  async function findFile() {
    const q = encodeURIComponent(`name='${FILE_NAME}'`);
    const list = await drive(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`).then((r) => r.json());
    return list.files?.[0]?.id ?? null;
  }

  async function readRemote() {
    const id = await findFile();
    if (!id) return { id: null, data: null };
    const data = await drive(`/drive/v3/files/${id}?alt=media`).then((r) => r.json());
    return { id, data: data && typeof data === 'object' && data.profile ? data : null };
  }

  async function writeRemote(id, content) {
    const body = JSON.stringify(content);
    if (id) {
      await drive(`/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return;
    }
    const boundary = `sivree${Date.now()}`;
    const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    await drive('/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
  }

  /**
   * ドライブと突き合わせる。版番号（rev）で「ドライブ側が更新されたか」、
   * この端末の更新時刻で「この端末が更新されたか」を判断し、片方だけなら新しい側に揃える。
   * 両方が更新されていたら resolveConflict() で利用者に選んでもらう。
   */
  function run(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }

  const localProfile = () => fetch('/api/profile').then((r) => r.json());
  /** 競合のとき、保存した記事はどちらの端末のものも残す（設定は選ばれたほうを使うが、記事は失わない） */
  const mergedSaved = (winner, other) => (window.SivreeSaved ? window.SivreeSaved.mergeSavedItems(winner?.savedItems, other?.savedItems) : winner?.savedItems ?? []);
  /** 競合のとき、候補を最後に見た日は新しい方を使う（どちらの端末で見ても、見た候補を「新しい」と出さない） */
  const laterSeen = (winner, other) => [winner?.candidatesSeenAt, other?.candidatesSeenAt].filter(Boolean).sort().pop() ?? '';
  async function applyLocal(profile) {
    applying = true;
    try {
      const response = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
      if (!response.ok) throw new Error('invalid-remote');
    } finally {
      applying = false;
    }
  }

  function sync({ interactive, resolveConflict = conflictResolver }) {
    // トークンの要求は、順番待ちより前に（タップの処理の中で）始める
    const ready = getToken(interactive);
    ready.catch(() => {});
    return run(async () => {
      await ready;
      const state = readState();
      const remote = await readRemote();
      const dirty = localUpdatedAt() > (state.syncedAt || 0);
      const remoteRev = remote.data?.rev || 0;
      const baseRev = state.baseRev || 0;
      let action;
      if (!remote.data) action = 'push';
      else if (remoteRev > baseRev) action = dirty ? 'conflict' : 'pull';
      else action = dirty ? 'push' : 'none';
      const conflict = action === 'conflict';
      if (conflict) action = resolveConflict && !resolveConflict() ? 'push' : 'pull';

      if (action === 'pull') {
        let incoming = remote.data.profile;
        let rev = remoteRev;
        if (conflict) {
          const local = await localProfile();
          incoming = { ...incoming, savedItems: mergedSaved(incoming, local), candidatesSeenAt: laterSeen(incoming, local) };
          await applyLocal(incoming);
          // この端末にしかなかった保存済みの記事があれば、ドライブにも反映して揃える
          if (incoming.savedItems.length > (remote.data.profile.savedItems?.length ?? 0)) {
            rev = Math.max(remoteRev, baseRev) + 1;
            await writeRemote(remote.id, { rev, savedAt: new Date().toISOString(), profile: incoming });
          }
        } else {
          await applyLocal(incoming);
        }
        writeState({ enabled: true, baseRev: rev, syncedAt: localUpdatedAt(), lastAt: Date.now() });
        notify({ type: 'pulled' });
      } else if (action === 'push') {
        let profile = await localProfile();
        if (conflict) {
          profile = { ...profile, savedItems: mergedSaved(profile, remote.data.profile), candidatesSeenAt: laterSeen(profile, remote.data.profile) };
          await applyLocal(profile);
        }
        const rev = Math.max(remoteRev, baseRev) + 1;
        await writeRemote(remote.id, { rev, savedAt: new Date().toISOString(), profile });
        writeState({ enabled: true, baseRev: rev, syncedAt: localUpdatedAt(), lastAt: Date.now() });
      } else {
        writeState({ ...state, enabled: true, lastAt: Date.now() });
      }
      notify({ type: action });
      return action;
    });
  }

  async function disconnect() {
    if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
    setToken(null, 0);
    clearTimeout(pushTimer);
    writeState(null);
    notify({ type: 'disconnected' });
  }

  /** ドライブにある設定ファイルを消す（この端末の設定は残る） */
  function deleteRemote() {
    return run(async () => {
      await getToken(true);
      const id = await findFile();
      if (id) await drive(`/drive/v3/files/${id}`, { method: 'DELETE' });
      writeState({ ...readState(), baseRev: 0, syncedAt: 0 });
      notify({ type: 'deleted' });
    });
  }

  // 設定を保存したら、同期が有効でトークンがある（または取得中の）ときは少し待ってから反映する。
  // トークンがなければ、画面に「同期のタップが必要」と知らせる
  window.addEventListener('sivree:profile-saved', () => {
    if (applying || !readState().enabled) return;
    if (!hasToken() && !pendingToken) {
      notify({ type: 'needs-tap' });
      return;
    }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { sync({ interactive: false }).catch(() => notify({ type: 'error' })); }, PUSH_DELAY);
  });

  window.SivreeSync = {
    available: Boolean(CLIENT_ID),
    state: readState,
    /** 同期は有効だが、このタブにトークンがない（同期するにはタップが必要） */
    needsTap: () => Boolean(readState().enabled) && !hasToken() && !pendingToken,
    connect: (resolveConflict) => sync({ interactive: true, resolveConflict }),
    syncNow: (resolveConflict) => sync({ interactive: true, resolveConflict }),
    /** 設定の保存ボタンなど、タップの処理の中で呼ぶ。同期が有効でトークンがなければ、ここで許可を取りにいく */
    prepare: () => {
      if (readState().enabled && !hasToken()) getToken(true).catch(() => notify({ type: 'error' }));
    },
    /**
     * ページを開いたとき。このタブに有効なトークンがあれば画面を出さずに同期する。
     * なければ Google のスクリプトだけ先に読み込み（タップしたときにすぐ開けるように）、何もしない
     */
    auto: (resolveConflict) => {
      if (resolveConflict) conflictResolver = resolveConflict;
      if (!readState().enabled) return Promise.resolve(null);
      if (!hasToken()) {
        loadGis().catch(() => {});
        return Promise.resolve(null);
      }
      return sync({ interactive: false }).catch(() => null);
    },
    disconnect,
    deleteRemote,
    on: (fn) => listeners.push(fn)
  };
})();
