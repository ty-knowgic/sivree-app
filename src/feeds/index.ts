import type { FeedSource } from '../types.js';
import { coreFeeds } from './core.js';
import { professionalFeeds } from './professional.js';
import { usPolicyFeeds } from './usPolicy.js';

/**
 * 取得するフィードのすべて。並びが取得の優先順位で、取得の上限時間を超えたときは、後ろのフィードから見送る。
 * 情報源を足すときは、このディレクトリにファイルを足してここに並べる（src/newsPipeline.ts には書かない）。
 * 凍結（2026-10-20）より後に足す情報源には、since を付ける（scripts/test-feeds.ts が確かめる）
 */
export const officialFeeds: FeedSource[] = [...coreFeeds, ...professionalFeeds, ...usPolicyFeeds];
