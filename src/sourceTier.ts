import type { FeedSource } from './types.js';

/**
 * 情報源の提供層。属性（pack・level）だけから決まり、層のための列は持たない。
 *   paid    専門パックの情報源（正式版では有償）
 *   limited 州・県・市区町村の政府（正式版では、同じ国の州・県1つと都市2つまでが無償）
 *   free    中央政府・国際機関・企業・研究機関・団体（標準の情報源）
 * 同じ情報源の表示は、層で変えない（層で変わるのは、選べる範囲だけ）。
 * 上限の判定と絞り込みは別の段階で足す。ここは層と「既定でオンか」を返すだけで、取得と表示はまだ使っていない
 */
export type SourceTier = 'free' | 'limited' | 'paid';

type TierInput = Pick<FeedSource, 'pack' | 'level' | 'since'>;

export function tierOf(source: TierInput): SourceTier {
  if (source.pack) return 'paid';
  if (source.level === 'regional' || source.level === 'local') return 'limited';
  return 'free';
}

/**
 * 既定でオンの情報源か。無償で、凍結（2026-10-20）より後に足した情報源（since が付くもの）ではないこと。
 * 無償でも since が付いた情報源（例: 規約が確認できるまで候補に置く中央政府）は、既定ではオフの候補になる
 */
export function defaultOn(source: TierInput): boolean {
  return tierOf(source) === 'free' && !source.since;
}
