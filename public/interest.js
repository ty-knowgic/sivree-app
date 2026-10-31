// 記事の「関心がない…」: トピックの優先度を下げる・除外キーワードを足す、その記録と取り消しの処理。画面の描画は app.js が行う。
// ここには日本語の文言を置かない（翻訳が必要な文は、app.js が t() で作る）。
// 入力は保存済みのプロフィールで、変更したプロフィールを返す（元のオブジェクトは変えない）。保存は呼び出し側が updateProfile で行う。
(function () {
  // 設定画面の優先度の段階（public/app.js の WEIGHT_OPTIONS と同じ値）
  const WEIGHT_STEPS = [0.6, 1, 1.6, 2.2];
  // src/profile.ts の EXCLUDE_KEYWORDS_LIMIT / ADJUSTMENTS_LIMIT と同じ値
  const EXCLUDE_LIMIT = 40;
  const ADJUSTMENTS_LIMIT = 60;
  const KEYWORD_MAX = 60;
  const TITLE_MAX = 120;
  const EPSILON = 0.001;

  const nearestStep = (weight) => WEIGHT_STEPS.reduce((best, step) => (Math.abs(step - weight) < Math.abs(best - weight) ? step : best));
  const sameWeight = (a, b) => Math.abs(a - b) < EPSILON;
  const normalizeWord = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, KEYWORD_MAX);
  const sameWord = (a, b) => a.toLowerCase() === b.toLowerCase();
  const topicOf = (profile, topicId) => profile.topics.find((topic) => topic.id === topicId);

  /** 優先度を1段階下げた値。すでに最低なら null（段階の間の値は、近い段階の1つ下） */
  function lowerStep(weight) {
    const index = WEIGHT_STEPS.indexOf(nearestStep(weight));
    return index > 0 ? WEIGHT_STEPS[index - 1] : null;
  }

  function newId(now) {
    return now.getTime().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function withEntry(profile, entry, topics) {
    return { ...profile, topics, adjustments: [entry, ...(profile.adjustments ?? [])].slice(0, ADJUSTMENTS_LIMIT) };
  }

  /**
   * トピックの優先度を1段階下げる。戻り値は { profile, entry }。
   * 失敗は { error }（'no-topic' トピックがない / 'lowest' すでに最低）
   */
  function lowerWeight(profile, topicId, title, now = new Date()) {
    const topic = topicOf(profile, topicId);
    if (!topic) return { error: 'no-topic' };
    const to = lowerStep(topic.weight);
    if (to === null) return { error: 'lowest' };
    const entry = {
      id: newId(now), at: now.toISOString(), kind: 'weight', topicId, topicLabel: topic.label,
      from: topic.weight, to, title: String(title ?? '').slice(0, TITLE_MAX)
    };
    return { profile: withEntry(profile, entry, profile.topics.map((t) => (t.id === topicId ? { ...t, weight: to } : t))), entry };
  }

  /**
   * トピックに除外キーワードを足す。戻り値は { profile, entry }。
   * 失敗は { error }（'no-topic' / 'empty' 空の語 / 'duplicate' すでにある / 'limit' 上限）
   */
  function addExclude(profile, topicId, keyword, title, now = new Date()) {
    const topic = topicOf(profile, topicId);
    if (!topic) return { error: 'no-topic' };
    const word = normalizeWord(keyword);
    if (!word) return { error: 'empty' };
    const current = topic.excludeKeywords ?? [];
    if (current.some((existing) => sameWord(existing, word))) return { error: 'duplicate' };
    if (current.length >= EXCLUDE_LIMIT) return { error: 'limit' };
    const entry = {
      id: newId(now), at: now.toISOString(), kind: 'exclude', topicId, topicLabel: topic.label,
      keyword: word, title: String(title ?? '').slice(0, TITLE_MAX)
    };
    return { profile: withEntry(profile, entry, profile.topics.map((t) => (t.id === topicId ? { ...t, excludeKeywords: [...current, word] } : t))), entry };
  }

  /**
   * 記録がいま効いているか。トピックの現在の値で判断する（記録だけを信じない）:
   * active = まだ効いている / changed = 設定で別の値に変えた・消した / missing = トピックを削除した
   */
  function stateOf(profile, entry) {
    const topic = topicOf(profile, entry.topicId);
    if (!topic) return 'missing';
    if (entry.kind === 'weight') return sameWeight(topic.weight, entry.to) ? 'active' : 'changed';
    return (topic.excludeKeywords ?? []).some((word) => sameWord(word, entry.keyword)) ? 'active' : 'changed';
  }

  /** 記録を取り消す。まだ効いていれば元に戻し（優先度は下げる前の値、キーワードは外す）、効いていなければ記録だけを消す */
  function undo(profile, entryId) {
    const entry = (profile.adjustments ?? []).find((candidate) => candidate.id === entryId);
    if (!entry) return profile;
    const adjustments = profile.adjustments.filter((candidate) => candidate.id !== entryId);
    if (stateOf(profile, entry) !== 'active') return { ...profile, adjustments };
    const topics = profile.topics.map((topic) => {
      if (topic.id !== entry.topicId) return topic;
      return entry.kind === 'weight'
        ? { ...topic, weight: entry.from }
        : { ...topic, excludeKeywords: (topic.excludeKeywords ?? []).filter((word) => !sameWord(word, entry.keyword)) };
    });
    return { ...profile, topics, adjustments };
  }

  const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'will', 'new', 'has', 'have', 'its', 'into', 'about', 'more', 'than', 'over', 'under', 'after', 'before']);

  /** 見出しから、除外キーワードの候補にできる語を拾う（単語の区切りは Intl.Segmenter。使えなければ空） */
  function suggestWords(titles, limit = 10) {
    if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return [];
    const found = [];
    for (const title of titles) {
      const text = String(title ?? '');
      if (!text) continue;
      const segmenter = new Intl.Segmenter(/[ぁ-んァ-ヶ一-龠]/.test(text) ? 'ja' : 'en', { granularity: 'word' });
      for (const part of segmenter.segment(text)) {
        const word = part.segment.trim();
        if (!part.isWordLike || /^[\d\s.,:;/\-–—_]+$/.test(word)) continue;
        const ascii = /^[\x00-\x7F]+$/.test(word);
        // 英字は3字以上、日本語などは2字以上。ひらがなだけの短い語（助詞・助動詞）は除く
        if (ascii ? word.length < 3 || STOP_WORDS.has(word.toLowerCase()) : word.length < 2 || (/^[ぁ-ん]+$/.test(word) && word.length < 3)) continue;
        if (!found.some((existing) => sameWord(existing, word))) found.push(word);
        if (found.length >= limit) return found;
      }
    }
    return found;
  }

  window.SivreeInterest = { WEIGHT_STEPS, EXCLUDE_LIMIT, ADJUSTMENTS_LIMIT, KEYWORD_MAX, nearestStep, lowerStep, lowerWeight, addExclude, stateOf, undo, suggestWords, normalizeWord };
})();
