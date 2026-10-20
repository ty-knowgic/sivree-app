// 法務ページの言語切り替え。日本語と英語を用意し、保存した表示言語（なければブラウザの言語）で選ぶ。
// それ以外の言語では英語を表示する。スクリプトが動かないときは両方を表示する。
(function () {
  var saved = '';
  try {
    saved = localStorage.getItem('sivry:lang') || '';
  } catch (e) {
    // 保存データが読めなくても、ブラウザの言語設定で選ぶ
  }
  var preferred = saved || (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
  // #en-privacy のように言語つきの見出しへのリンクは、その言語で開く（Google の同意画面から開く審査担当者にも読める言語になる）
  var linked = /^#(ja|en)-/.exec(location.hash || '');
  var current = linked ? linked[1] : String(preferred).toLowerCase().indexOf('ja') === 0 ? 'ja' : 'en';

  function show(lang) {
    document.querySelectorAll('[data-legal]').forEach(function (el) { el.hidden = el.dataset.legal !== lang; });
    document.querySelectorAll('.legal-lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === lang)); });
    document.documentElement.lang = lang;
  }

  document.querySelectorAll('.legal-lang button').forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.lang); });
  });
  show(current);
  // 非表示だった側の見出しへのリンクは、表示を切り替えたあとにその位置へ移動する
  var target = linked && document.getElementById(location.hash.slice(1));
  if (target) target.scrollIntoView();
})();
