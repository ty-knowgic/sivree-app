// 初回の質問（地域 → 分野 → テーマ）を実際の app.js でたどり、選んだテーマだけが有効なトピックとして保存されることを確かめる。
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const src = (await readFile(path.join(root, 'i18n.js'), 'utf8')) + '\n' + (await readFile(path.join(root, 'app.js'), 'utf8'));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failures++; };

const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
let saved = null;
let waitForFilters = null;
const profile = { onboarded: false, regions: [], categories: [], hiddenItems: [], excludedSources: [], topics: ['genai', 'health', 'space', 'local'].map(id => ({ id, label: id, enabled: false, keywords: [], weight: 1 })) };
const options = {
  regions: [{ value: '日本', sources: 3 }, { value: '米国', sources: 4 }],
  categories: [{ value: '経済', articles: 5 }, { value: 'テクノロジー', articles: 9 }],
  topics: [{ value: 'genai', label: '生成AI' }, { value: 'health', label: '医療・公衆衛生' }, { value: 'space', label: '宇宙・天文' }]
};
const respond = (body, extra = {}) => ({ ok: true, status: 200, json: async () => body, headers: new Map(), ...extra });
w.fetch = async (url, init = {}) => {
  if (url === '/api/profile') {
    if (init.method === 'PUT') { saved = JSON.parse(init.body); return respond(saved); }
    return respond(saved ?? profile);
  }
  if (url === '/api/options') return respond(options);
  if (url === '/api/filters') {
    if (waitForFilters) await new Promise(resolve => { waitForFilters = resolve; });
    return respond({ categories: [], subgroups: {}, sourceTypes: [] });
  }
  if (String(url).startsWith('/api/news')) return respond([], { headers: new Map([['X-Total-Count', '0']]) });
  if (url === '/api/briefing') return respond({ stories: [], storyCount: 0 });
  return respond({});
};
w.IntersectionObserver = class { observe() {} };
w.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
w.Element.prototype.scrollIntoView = () => {};
w.scrollTo = () => {};
let connectResult = 'cancel';
let syncListener;
let connectCalls = 0;
w.SivreeSync = {
  available: true,
  on(listener) { syncListener = listener; },
  auto() {}, needsAuth: () => false, needsSync: () => false, state: () => ({}),
  prepare() {},
  async connect() {
    connectCalls++;
    if (connectResult === 'cancel') throw new Error('popup_closed');
    if (connectResult === 'pull') {
      saved = { ...profile, onboarded: true, regions: ['米国'], categories: ['経済'] };
      syncListener({ type: 'pulled' });
    }
    return connectResult;
  }
};
w.eval(src + `
window.restartOnboarding = () => { onboarding.step = 1; return showOnboarding(); };
window.settingsFixture = (profile, sources) => {
  state.needsOnboarding = false;
  profileDraft = JSON.parse(JSON.stringify(profile));
  profileDraftBase = JSON.parse(JSON.stringify(profile));
  sourcesDraft = sources;
  settingsPane = 'sources';
  onboardingView.hidden = true;
  listView.hidden = true;
  settingsView.hidden = false;
  renderSettings();
};`);
await w.i18nReady;
const until = async (cond, ms = 3000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 20)); return cond(); };
const view = () => w.document.getElementById('onboardingView');
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const next = () => view().querySelector('[data-action="next"]');

check('最初の質問が表示される', await until(() => view().querySelector('.choice-grid[data-kind="regions"]')));
check('質問の前に既存ユーザーの読み込み導線がある', view().querySelector('.onb-restore')?.compareDocumentPosition(view().querySelector('.onb-questions')) === w.Node.DOCUMENT_POSITION_FOLLOWING);
click(view().querySelector('[data-action="restore-profile"]'));
check('キャンセルしても質問を続けられる', await until(() => connectCalls === 1 && !view().querySelector('[data-action="restore-profile"]').disabled) && saved === null);
connectResult = 'none';
click(view().querySelector('[data-action="restore-profile"]'));
check('同期済みデータがない場合は案内し、未設定のまま質問を続けられる', await until(() => w.document.querySelector('.toast')?.textContent.includes('同期済みの設定がありません')) && saved === null && !next().closest('fieldset').disabled);
check('何も選ばないと「次へ」は押せない', next().disabled === true);
click(view().querySelector('.choice[data-value="日本"]'));
check('選ぶと「次へ」が押せる', next().disabled === false);
click(next());
check('2つ目は分野', view().querySelector('.choice-grid[data-kind="categories"]') !== null && view().textContent.includes('2 / 3'));
click(view().querySelector('.choice[data-value="経済"]'));
click(next());
check('3つ目はテーマ（3問）', view().querySelector('.choice-grid[data-kind="topics"]') !== null && view().textContent.includes('3 / 3'));
check('テーマの名前が選択肢に出る', view().textContent.includes('医療・公衆衛生') && view().textContent.includes('宇宙'));
check('最後は「はじめる」', next().textContent.trim().length > 0 && !next().textContent.includes('次へ'));
click(view().querySelector('[data-action="back"]'));
check('「戻る」で1つ前の質問に戻る', view().querySelector('.choice-grid[data-kind="categories"]') !== null);
click(next());
click(view().querySelector('.choice[data-value="genai"]'));
click(view().querySelector('.choice[data-value="space"]'));
click(next());
check('保存される', await until(() => saved !== null));
check('選んだテーマだけが有効になる', saved?.topics.filter(t => t.enabled).map(t => t.id).join() === 'genai,space', JSON.stringify(saved?.topics.map(t => [t.id, t.enabled])));
check('選ばなかったトピックは無効のまま', saved?.topics.find(t => t.id === 'local').enabled === false && saved?.topics.find(t => t.id === 'health').enabled === false);
check('地域・分野が保存され、初回の質問は完了になる', saved?.onboarded === true && saved.regions.join() === '日本' && saved.categories.join() === '経済');

await until(() => view().hidden);
const source = (id, categories, region = '日本', pack) => ({ id, categories, subgroup: region, pack, candidate: true, sourceType: 'official', level: 'national', sourceName: id, label: id, sourceUrl: 'https://example.test/', count: 1 });
const sources = [source('economy', ['経済', 'テクノロジー']), source('technology', ['テクノロジー']), source('outside', ['経済'], '米国'), source('specialist', ['経済'], '日本', { id: 'test', name: 'Test pack', blurb: 'Test' }),
  { ...source('waterloo', ['社会'], 'カナダ'), sourceName: 'ウォータールー市', level: 'local', area: 'CA-ON', city: 'waterloo' },
  { ...source('mlit', ['社会']), sourceName: '国土交通省' },
  { ...source('shiho', ['社会']), sourceName: '日本司法書士会連合会', sourceType: 'npo', level: undefined }];
saved = { ...saved, regions: ['日本', 'カナダ'], extraSources: ['economy'], candidatesSeenAt: '', savedItems: [] };
w.settingsFixture(saved, sources);
const settings = w.document.getElementById('settingsView');
check('候補は国・地域でまとまり、情報源が重複しない', settings.querySelectorAll('.candidate-region').length === 4 && settings.querySelectorAll('[data-source="economy"]').length === 1);
check('有効な候補の国は開き、対象外の国の候補は選べない', settings.querySelector('[data-candidate-region="日本"]').open && settings.querySelector('[data-source="outside"]').disabled);
check('ウォータールー市はカナダの自治体・オンタリオ州にある', settings.querySelector('[data-source="waterloo"]').closest('[data-candidate-region]').dataset.candidateRegion === 'カナダ' && settings.querySelector('[data-source="waterloo"]').closest('[data-candidate-kind]').dataset.candidateKind === 'local' && settings.querySelector('[data-source="waterloo"]').closest('section').textContent.includes('オンタリオ州'));
check('同じ社会分野でも国交省と司法書士会を自治体と混ぜない', settings.querySelector('[data-source="mlit"]').closest('[data-candidate-kind]').dataset.candidateKind === 'national' && settings.querySelector('[data-source="shiho"]').closest('[data-candidate-kind]').dataset.candidateKind === 'npo');
check('専門パックの説明・区分を維持する', settings.querySelector('[data-pack="test"] .candidate-region [data-source="specialist"]') !== null);
const technology = settings.querySelector('[data-source="technology"]');
technology.checked = true;
technology.dispatchEvent(new w.Event('change', { bubbles: true }));
check('国と発信主体の選択数が切り替え直後に更新される', technology.closest('section').querySelector('.source-count').textContent === '2/3' && technology.closest('details').querySelector('.source-count').textContent === '2/4');
const search = settings.querySelector('[data-candidate-search]');
search.value = 'ウォータールー';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
check('名称検索で該当する国を開き、他の情報源を隠す', !settings.querySelector('[data-source="waterloo"]').closest('li').hidden && settings.querySelector('[data-source="waterloo"]').closest('details').open && technology.closest('li').hidden);
search.value = 'unregistered-city';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
check('未登録の情報源は検索結果なしと明示する', !settings.querySelector('[data-candidate-empty]').hidden);
search.value = '';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
check('検索を解除しても候補の選択は保持される', technology.checked && !technology.closest('li').hidden);
// Hold the filter request open longer than the old toast window, without a
// wall-clock sleep: success must be announced after navigation is ready.
w.document.querySelectorAll('.toast').forEach(el => el.remove());
waitForFilters = true;
click(settings.querySelector('[data-action="save-profile"]'));
await until(() => typeof waitForFilters === 'function');
check('保存後の読み込み中に通知の表示時間を消費しない', !w.document.querySelector('.toast'));
const releaseFilters = waitForFilters;
waitForFilters = null;
releaseFilters();
check('閲覧画面に戻った後で保存完了を通知する', await until(() => settings.hidden && w.document.querySelector('.toast')?.textContent === '保存しました'));
check('候補の変更が保存される', saved.extraSources.includes('technology'));

// A returning user can restore without submitting any onboarding answers.
await until(() => view().hidden);
saved = null;
connectResult = 'pull';
let reloadScheduled = false;
const originalTimeout = w.setTimeout.bind(w);
w.setTimeout = (fn, delay, ...args) => {
  if (delay === 900) { reloadScheduled = true; return 0; }
  return originalTimeout(fn, delay, ...args);
};
await w.restartOnboarding();
await until(() => view().querySelector('[data-action="restore-profile"]'));
click(view().querySelector('[data-action="restore-profile"]'));
check('質問を保存せず既存の地域・分野を読み込んで再表示する', await until(() => reloadScheduled) && saved?.onboarded === true && saved.regions.join() === '米国');

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
