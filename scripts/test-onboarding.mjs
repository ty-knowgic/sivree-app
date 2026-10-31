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
    return respond({ categories: [], subgroups: {}, sourceTypes: [], regions: ['日本', '米国'], regionOrder: (saved ?? profile).regionOrder ?? [] });
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
window.__t = { state, draft: () => profileDraft };
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
const regionGrid = () => [...view().querySelectorAll('.choice-grid[data-kind="regions"] .choice')].map(choice => choice.dataset.value);
check('初回の質問の地域は、端末の言語（en-US）の地域を先頭に、情報源の多い順に並ぶ', regionGrid().join() === '米国,日本', regionGrid());
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
const source = (id, categories, region = '日本', pack) => ({ id, categories, subgroup: region, pack, candidate: true, sourceType: 'research', sourceName: id, label: id, sourceUrl: 'https://example.test/', count: 1 });
const sources = [source('economy', ['経済', 'テクノロジー']), source('technology', ['テクノロジー']), source('outside', ['経済'], '米国'), source('specialist', ['経済'], '日本', { id: 'test', name: 'Test pack', blurb: 'Test' }),
  { ...source('waterloo', ['社会'], 'カナダ'), sourceType: 'official', sourceName: 'ウォータールー市', level: 'local', area: 'CA-ON', city: 'waterloo' },
  { ...source('osc-news', ['経済'], 'カナダ'), sourceType: 'official', level: 'regional', area: 'CA-ON', sourceName: 'オンタリオ州証券委員会', label: 'OSC News' },
  { ...source('osc-rules', ['経済'], 'カナダ'), sourceType: 'official', level: 'regional', area: 'CA-ON', sourceName: 'オンタリオ州証券委員会', label: 'OSC Instruments, Rules and Policies' },
  { ...source('mb-gov', ['政治'], 'カナダ'), sourceType: 'official', level: 'regional', area: 'CA-MB', sourceName: 'マニトバ州政府', label: 'Manitoba News Releases' },
  { ...source('sk-gov', ['政治'], 'カナダ'), sourceType: 'official', level: 'regional', area: 'CA-SK', sourceName: 'サスカチュワン州政府', label: 'Saskatchewan News Releases' },
  { ...source('mlit', ['社会']), sourceType: 'official', level: 'national', sourceName: '国土交通省' },
  { ...source('cagov', ['政治'], 'カナダ'), candidate: false, sourceType: 'official', level: 'national', sourceName: 'カナダ政府' },
  { ...source('shiho', ['社会']), sourceName: '日本司法書士会連合会', sourceType: 'npo', level: undefined }];
saved = { ...saved, regions: ['日本', 'カナダ'], extraSources: ['economy'], candidatesSeenAt: '', savedItems: [] };
w.settingsFixture(saved, sources);
const settings = w.document.getElementById('settingsView');
check('追加情報源は国・地域でまとまり、情報源が重複しない', settings.querySelectorAll('.candidate-region').length === 3 && settings.querySelectorAll('[data-source="economy"]').length === 1);
check('有効な候補の国は開き、対象外の国の候補は選べない', settings.querySelector('[data-candidate-region="日本"]').open && settings.querySelector('[data-source="outside"]').disabled);
check('ウォータールー市はカナダの自治体・オンタリオ州にある', settings.querySelector('[data-source="waterloo"]').closest('[data-candidate-region]').dataset.candidateRegion === 'カナダ' && settings.querySelector('[data-source="waterloo"]').closest('[data-candidate-kind]').dataset.candidateKind === 'local' && settings.querySelector('[data-source="waterloo"]').closest('section').textContent.includes('オンタリオ州'));
check('国交省は他の省庁と同じ政府一覧・日本に置き、初期オフを維持する', settings.querySelector('[data-source="mlit"]').closest('[data-type]').dataset.type === 'official' && settings.querySelector('[data-source="mlit"]').closest('.source-country').textContent.includes('日本') && !settings.querySelector('[data-source="mlit"]').checked);
check('追加情報源と専門パックを同じ階層に置く', settings.querySelector('[data-candidates] h2').textContent.includes('追加情報源') && settings.querySelector('.specialist-packs > h2').textContent === '専門パック' && settings.querySelector('[data-pack] .source-pack-head h3') && settings.querySelector('[data-candidates]').parentElement === settings.querySelector('.specialist-packs').parentElement);
check('専門パックは分野内で直接情報源を選択できる', settings.querySelector('[data-pack="test"] .professional-group [data-source="specialist"]') !== null);
// ---------- 同じ名前で別フィードの行 ----------
{
  const rowOf = id => settings.querySelector(`[data-candidates] [data-source="${id}"]`).closest('li');
  const nameOf = id => rowOf(id).querySelector('.source-name').textContent;
  const descOf = id => rowOf(id).querySelector('.source-desc').textContent;
  check('同じ発信元名の2つのフィードは、ラベルを行名にして見分けられる', nameOf('osc-news') === 'OSC News' && nameOf('osc-rules') === 'OSC Instruments, Rules and Policies', [nameOf('osc-news'), nameOf('osc-rules')]);
  check('同じ名前の行は、発信元名を説明行に1回だけ出す', [descOf('osc-news'), descOf('osc-rules')].every(text => text.split('オンタリオ州証券委員会').length === 2), [descOf('osc-news'), descOf('osc-rules')]);
  check('名前が重ならない行は、これまでどおり発信元名が行名', nameOf('waterloo') === 'ウォータールー市' && nameOf('economy') === 'economy' && nameOf('shiho') === '日本司法書士会連合会');
  const areaHeadings = [...settings.querySelectorAll('[data-candidate-region="カナダ"] [data-candidate-kind="regional"] h4')].map(h => h.firstChild.textContent.trim());
  check('州・県は、登録順ではなく画面の言語での名前の順に並び、州名が見出しに付く', areaHeadings.join('|') === '州・都道府県の機関 · オンタリオ州|州・都道府県の機関 · サスカチュワン州|州・都道府県の機関 · マニトバ州', areaHeadings);
  check('専門パックの行は、これまでどおりラベルが行名', settings.querySelector('[data-pack="test"] [data-source="specialist"]').closest('li').querySelector('.source-name').textContent === 'specialist');
}

// ---------- 地域の並び順 ----------
{
  const all = ['日本', 'カナダ', '米国', '欧州', 'グローバル'];
  const setLanguages = list => Object.defineProperty(w.navigator, 'languages', { value: list, configurable: true });
  const home = list => { setLanguages(list); return w.homeRegion(); };
  check('端末の言語から地域を決める（ja→日本、*-CA→カナダ、*-US→米国、英国・欧州→欧州）',
    home(['ja-JP']) === '日本' && home(['ja']) === '日本' && home(['en-CA']) === 'カナダ' && home(['fr-CA', 'en']) === 'カナダ' && home(['en-US']) === '米国'
    && home(['en-GB']) === '欧州' && home(['de']) === '欧州' && home(['fr-FR']) === '欧州' && home(['es-ES', 'en']) === '欧州' && home(['en', 'ja']) === '日本',
    [home(['ja-JP']), home(['en-CA']), home(['en-US']), home(['en-GB']), home(['de'])]);
  check('決められない言語（英語だけ・国が対象外）は、地域を決めない', home(['en']) === '' && home(['en-AU']) === '' && home(['pt-BR', 'es']) === '' && home(['zh-Hans']) === '');
  setLanguages(['ja-JP']);
  check('自動の順: 日本語の端末は日本が先頭、残りは情報源の多い順（米国4・ほか0）、グローバルは最後', w.regionOrder(all)[0] === '日本' && w.regionOrder(all)[1] === '米国' && w.regionOrder(all).at(-1) === 'グローバル', w.regionOrder(all));
  setLanguages(['en-CA']);
  check('自動の順: カナダの端末はカナダが先頭（カナダを固定した順ではない）', w.regionOrder(all)[0] === 'カナダ' && w.regionOrder(all)[1] === '米国' && w.regionOrder(all)[2] === '日本', w.regionOrder(all));
  setLanguages(['de-DE']);
  check('自動の順: 欧州の端末は欧州が先頭', w.regionOrder(all)[0] === '欧州' && w.regionOrder(all)[1] === '米国' && w.regionOrder(all).at(-1) === 'グローバル', w.regionOrder(all));
  setLanguages(['en']);
  check('自動の順: 地域を決められない端末は、情報源の多い順（米国4・日本3）で、グローバルは最後', w.regionOrder(all).slice(0, 2).join() === '米国,日本' && w.regionOrder(all).at(-1) === 'グローバル', w.regionOrder(all));
  check('一部の地域だけを並べると、自動の順の相対的な順位を保つ', w.regionOrder(['日本', '米国']).join() === '米国,日本' && w.regionOrder(['日本', 'グローバル']).join() === '日本,グローバル');
  w.__t.state.regionOrderPref = ['欧州', '日本'];
  check('利用者の並び順が先で、残りは自動の順で続く', w.regionOrder(all).slice(0, 3).join() === '欧州,日本,米国' && w.regionOrder(all).at(-1) === 'グローバル', w.regionOrder(all));
  check('利用者の並び順にない地域だけを渡しても、その中で並ぶ', w.regionOrder(['米国', '日本']).join() === '日本,米国', w.regionOrder(['米国', '日本']));
  w.__t.state.regionOrderPref = [];
  setLanguages(['en-US']);

  // 設定: 国・地域の画面で、↑↓で並べ替える
  settings.querySelector('[name="settings-pane"][value="scope"]').click();
  const orderRows = () => [...settings.querySelectorAll('.region-order-row')].map(row => row.querySelector('[data-direction="up"]').dataset.region);
  const grid = () => [...settings.querySelectorAll('.choice-grid[data-kind="regions"] .choice')].map(choice => choice.dataset.value);
  const move = (region, direction) => click([...settings.querySelectorAll('[data-action="move-region"]')].find(button => button.dataset.region === region && button.dataset.direction === direction));
  const initial = orderRows();
  check('並び順の欄に、すべての地域が自動の順で並ぶ', initial.length === 5 && [...initial].sort().join() === [...all].sort().join() && initial[0] === '米国' && initial.at(-1) === 'グローバル', initial);
  check('自動の間は「自動に戻す」を押せない。国・地域の選択肢も同じ順', settings.querySelector('[data-action="reset-region-order"]').disabled && grid().join() === '米国,日本', grid());
  check('先頭の↑と末尾の↓は押せない', settings.querySelector('.region-order-row [data-direction="up"]').disabled && [...settings.querySelectorAll('.region-order-row')].at(-1).querySelector('[data-direction="down"]').disabled);
  check('↑↓のボタンに、地域の名前を含む読み上げ名がある', settings.querySelector('[data-action="move-region"][data-region="日本"][data-direction="up"]').getAttribute('aria-label').includes('日本'));
  move('日本', 'down');
  const swapped = orderRows();
  check('↓で1つ下に動き、国・地域の選択肢も新しい順になる', swapped.join() === [initial[0], initial[2], initial[1], ...initial.slice(3)].join() && JSON.stringify(w.__t.draft().regionOrder) === JSON.stringify(swapped), swapped);
  check('動かしたあとも、そのボタンにフォーカスが残る', w.document.activeElement?.dataset.region === '日本' && w.document.activeElement?.dataset.direction === 'down');
  check('並べ替えると「自動に戻す」を押せる', settings.querySelector('[data-action="reset-region-order"]').disabled === false);
  click(settings.querySelector('[data-action="reset-region-order"]'));
  check('「自動に戻す」で自動の順に戻る', orderRows().join() === initial.join() && w.__t.draft().regionOrder.length === 0);
  // 目標の順: カナダ → 日本 → 米国（カナダは先頭へ、日本はその次へ）
  for (let i = 0; i < 5 && orderRows()[0] !== 'カナダ'; i++) move('カナダ', 'up');
  for (let i = 0; i < 5 && orderRows()[1] !== '日本'; i++) move('日本', 'up');
  const target = orderRows();
  check('↑でカナダ・日本を先頭へ動かせる', target.slice(0, 3).join() === 'カナダ,日本,米国' && grid().join() === '日本,米国' && w.__t.draft().regionOrder.join() === target.join(), target);
  check('国・地域の選択（選んだ地域）は、並べ替えでは変わらない', w.__t.draft().regions.join() === '日本,カナダ');
  settings.querySelector('[name="settings-pane"][value="sources"]').click();
  const candidateRegions = [...settings.querySelectorAll('[data-candidate-region]')].map(details => details.dataset.candidateRegion);
  check('追加情報源の国の並びも、保存前の並び順に従う（選んだ地域が先、対象外の米国は最後）', candidateRegions.join() === 'カナダ,日本,米国', candidateRegions);
  const officialRegions = [...settings.querySelectorAll('.source-group[data-type="official"] .source-country-heading')].map(heading => heading.textContent);
  check('政府・自治体の一覧の国の並びも、同じ順に従う（自動の順なら日本が先）', officialRegions.join() === 'カナダ,日本', officialRegions);
}

const technology = settings.querySelector('[data-source="technology"]');
technology.checked = true;
technology.dispatchEvent(new w.Event('change', { bubbles: true }));
check('国と発信主体の選択数が切り替え直後に更新される', technology.closest('section').querySelector('.source-count').textContent === '2/2' && technology.closest('details').querySelector('.source-count').textContent === '2/3');
const mlit = settings.querySelector('[data-source="mlit"]');
mlit.checked = true;
mlit.dispatchEvent(new w.Event('change', { bubbles: true }));
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
check('政府一覧へ移した機関も従来の追加設定として保存される', saved.extraSources.includes('mlit'));
check('並び順が保存され、選んだ地域・候補のオンは変わらない', saved.regionOrder.slice(0, 3).join() === 'カナダ,日本,米国' && saved.regions.join() === '日本,カナダ' && saved.extraSources.includes('economy'), saved.regionOrder);
check('地域の絞り込みは、保存した並び順に従う', [...w.document.getElementById('subgroupFilter').options].map(option => option.value).join() === ',日本,米国', [...w.document.getElementById('subgroupFilter').options].map(option => option.value));

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
Object.defineProperty(w.navigator, 'languages', { value: ['ja-JP'], configurable: true });
w.__t.state.regionOrderPref = [];
await w.restartOnboarding();
await until(() => view().querySelector('.choice-grid[data-kind="regions"]'));
check('初回の質問の地域は、日本語の端末では日本が先頭になる', regionGrid().join() === '日本,米国', regionGrid());
click(view().querySelector('[data-action="restore-profile"]'));
check('質問を保存せず既存の地域・分野を読み込んで再表示する', await until(() => reloadScheduled) && saved?.onboarded === true && saved.regions.join() === '米国');

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
