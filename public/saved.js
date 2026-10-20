// 保存した記事の処理: 端末どうしの統合と、引用・書き出しの書式。画面の描画は app.js が行う。
// ここには日本語の文言を置かない（翻訳が必要な文は、app.js が t() で作って渡す）。
(function () {
  // 保存できる記事の上限（src/profile.ts の SAVED_LIMIT と同じ値）
  const LIMIT = 1000;
  // 発表日（引用に書く日付）は、閲覧者の時間帯ではなく、発信元の地域の日付にする。
  // 日本の省庁の朝の発表が、北米から見ると前日の夜になって、引用の日付が1日ずれるのを防ぐ。
  // 地域の中の時間帯の違い（英国など）は、日付が変わる前後の数時間にだけ影響する近似
  const REGION_TIMEZONE = { 日本: 'Asia/Tokyo', カナダ: 'America/Toronto', 米国: 'America/New_York', 欧州: 'Europe/Brussels' };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const BIB_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  // 引用の書式。plain は app.js が翻訳した文をそのまま使う（日本語なら「発信元「見出し」（日付発表）URL（日付閲覧）」）
  const FORMATS = {
    plain: { ext: 'txt', mime: 'text/plain' },
    apa: { ext: 'txt', mime: 'text/plain' },
    markdown: { ext: 'md', mime: 'text/markdown' },
    bibtex: { ext: 'bib', mime: 'application/x-bibtex' },
    ris: { ext: 'ris', mime: 'application/x-research-info-systems' },
    csv: { ext: 'csv', mime: 'text/csv' }
  };

  const pad = (number) => String(number).padStart(2, '0');
  const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
  const endWithPeriod = (text) => (/[.!?。！？]$/.test(text) ? text : `${text}.`);

  /** 発信元の地域の暦での年月日。日付として読めなければ null */
  function dateParts(value, subgroup) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: REGION_TIMEZONE[subgroup] ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
    return { year: pick('year'), month: pick('month'), day: pick('day') };
  }

  /** この端末の暦での年月日（閲覧日・保存日に使う） */
  function localParts(date) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }

  const isoDate = (parts) => (parts ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}` : '');
  const slashDate = (parts) => (parts ? `${parts.year}/${pad(parts.month)}/${pad(parts.day)}` : '');

  /** 年月日を表示言語の書式にする（時間帯のずれが出ないよう、UTC の日付として整形する） */
  function formatDate(parts, locale) {
    if (!parts) return '';
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).toLocaleDateString(locale, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
  }

  /** 記事（一覧・詳細で得たもの）から、保存する記録を作る。保存できない記事（URL がない等）は null */
  function toSavedItem(item, now = new Date()) {
    let url = '';
    try {
      const parsed = new URL(item.sourceUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = parsed.href;
    } catch {
      // URL として読めない記事は保存しない
    }
    const title = oneLine(item.title).slice(0, 500);
    if (!url || url.length > 2000 || !title || !/^[0-9a-f]{16}$/.test(String(item.id))) return null;
    return {
      id: item.id,
      title,
      sourceName: String(item.sourceName ?? '').slice(0, 100),
      sourceType: String(item.sourceType ?? 'official').slice(0, 20),
      subgroup: String(item.subgroup ?? '').slice(0, 20),
      url,
      publishedAt: String(item.publishedAt ?? '').slice(0, 40),
      savedAt: now.toISOString(),
      note: ''
    };
  }

  /**
   * 保存した記事を、2つの一覧から1つにまとめる（同じ記事は primary を優先し、メモは空でないほうを残す）。
   * 両方の端末で変更があった競合のとき、どちらの端末の保存も失わないために使う。
   * 片方で保存を解除した記事は、この統合では復活する（失うよりは残るほうを選ぶ）
   */
  function mergeSavedItems(primary, other) {
    const byId = new Map();
    for (const item of other ?? []) byId.set(item.id, item);
    for (const item of primary ?? []) {
      const twin = byId.get(item.id);
      byId.set(item.id, twin ? { ...twin, ...item, note: item.note || twin.note || '' } : item);
    }
    return [...byId.values()].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))).slice(0, LIMIT);
  }

  // ---------- 書式 ----------

  const escapeMarkdown = (text) => text.replace(/[\\[\]*_`<>]/g, '\\$&');
  // encodeURIComponent は ( ) を変換しないため、Markdown のリンクを壊さないよう自分で変換する
  const markdownUrl = (url) => url.replace(/[\s()<>]/g, (char) => encodeURIComponent(char).replace(/[()]/g, (paren) => `%${paren.charCodeAt(0).toString(16).toUpperCase()}`));
  const escapeBib = (text) => text
    .replace(/[\\{}]/g, (char) => ({ '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}' })[char])
    .replace(/[&%$#_]/g, '\\$&')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
  // 表計算ソフトが先頭の記号を式として実行しないよう、'を付ける（発信元の見出しは信頼できない入力）
  const csvCell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };

  /**
   * 引用を書式に整える。ctx:
   *   locale      表示言語のロケール（plain の日付に使う）
   *   accessed    閲覧日（Date。省略時は今日）
   *   sourceName  (item) => 現在の言語の発信元名
   *   plain       ({ source, title, date, url, accessed }) => 翻訳した出典表記の文（plain のみ）
   * 引用には利用者のメモを含めない（CSV と RIS だけが、記録として持ち出せるようメモを含める）
   */
  function formatCitations(items, format, ctx) {
    const accessed = localParts(ctx.accessed ?? new Date());
    const entries = items.map((item) => ({
      item,
      source: oneLine(ctx.sourceName(item)),
      title: oneLine(item.title),
      published: dateParts(item.publishedAt, item.subgroup),
      // 保存した日は、この端末の暦で書く
      saved: Number.isNaN(Date.parse(item.savedAt)) ? null : localParts(new Date(item.savedAt))
    }));

    if (format === 'plain') {
      return entries.map(({ item, source, title, published }) => ctx.plain({
        source, title, url: item.url, date: formatDate(published, ctx.locale), accessed: formatDate(accessed, ctx.locale)
      })).join('\n');
    }
    if (format === 'apa') {
      return entries.map(({ item, source, title, published }) => {
        const date = published ? `${published.year}, ${MONTHS[published.month - 1]} ${published.day}` : 'n.d.';
        return `${endWithPeriod(source)} (${date}). ${endWithPeriod(title)} ${item.url}`;
      }).join('\n');
    }
    if (format === 'markdown') {
      const bullet = entries.length > 1 ? '- ' : '';
      return entries.map(({ item, source, title, published }) =>
        `${bullet}[${escapeMarkdown(title)}](${markdownUrl(item.url)}) — ${[escapeMarkdown(source), isoDate(published)].filter(Boolean).join(', ')}`).join('\n');
    }
    if (format === 'bibtex') {
      return entries.map(({ item, source, title, published }) => [
        `@misc{src${published?.year ?? 'nd'}-${item.id.slice(0, 6)},`,
        `  author = {{${escapeBib(source)}}},`,
        `  title = {{${escapeBib(title)}}},`,
        ...(published ? [`  year = {${published.year}},`, `  month = ${BIB_MONTHS[published.month - 1]},`] : []),
        `  url = {${item.url.replace(/[{}]/g, (char) => encodeURIComponent(char))}},`,
        `  urldate = {${isoDate(accessed)}}`,
        '}'
      ].join('\n')).join('\n\n');
    }
    if (format === 'ris') {
      return entries.map(({ item, source, title, published }) => [
        'TY  - ELEC',
        `AU  - ${source}`,
        `TI  - ${title}`,
        ...(published ? [`PY  - ${published.year}`, `DA  - ${slashDate(published)}`] : []),
        `UR  - ${item.url}`,
        `Y2  - ${slashDate(accessed)}`,
        ...(item.note ? [`N1  - ${oneLine(item.note)}`] : []),
        'ER  - '
      ].join('\n')).join('\n\n');
    }
    if (format === 'csv') {
      const rows = [['published', 'source', 'title', 'url', 'saved', 'note'], ...entries.map(({ item, source, title, published, saved }) =>
        [isoDate(published), source, title, item.url, isoDate(saved), item.note ?? ''])];
      // 先頭の BOM は、Excel が UTF-8 として開くため
      return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
    }
    throw new Error(`unknown format: ${format}`);
  }

  window.SivreeSaved = { LIMIT, FORMATS, toSavedItem, mergeSavedItems, formatCitations, dateParts, formatDate, localParts };
})();
