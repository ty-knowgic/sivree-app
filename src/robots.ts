import { createRequire } from 'node:module';

// robots-parser は CommonJS のため、型の都合で require で読み込む
interface Robot { isAllowed(url: string, userAgent?: string): boolean | undefined }
const robotsParser = createRequire(import.meta.url)('robots-parser') as (url: string, text: string) => Robot;

/**
 * 発信元のページを取得する前に robots.txt を確認する（RFC 9309）。
 * robots.txt が無い（4xx）場合は取得してよい。応答が得られない（5xx・通信エラー）場合は、取得を控える
 */
export const CRAWLER_NAME = 'SivreeBot';
export const USER_AGENT = `Mozilla/5.0 (compatible; ${CRAWLER_NAME}/1.0; +https://sivree.com/legal.html#en-sources)`;

const TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 5000;

export interface RobotsDecision {
  allowed: boolean;
  reason: 'allowed' | 'disallowed' | 'missing' | 'http-error' | 'network-error' | 'timeout' | 'invalid-url';
  status?: number;
}
interface Entry { robot: Robot | null; allowAll: boolean; expires: number; reason: RobotsDecision['reason']; status?: number }
const cache = new Map<string, Entry>();
const pending = new Map<string, Promise<Entry>>();

async function load(origin: string): Promise<Entry> {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) {
      const text = (await response.text()).slice(0, 512 * 1024);
      return { robot: robotsParser(robotsUrl, text), allowAll: false, expires: Date.now() + TTL_MS, reason: 'allowed', status: response.status };
    }
    if (response.status >= 400 && response.status < 500) return { robot: null, allowAll: true, expires: Date.now() + TTL_MS, reason: 'missing', status: response.status };
    return { robot: null, allowAll: false, expires: Date.now() + FAILURE_TTL_MS, reason: 'http-error', status: response.status };
  } catch (error) {
    return { robot: null, allowAll: false, expires: Date.now() + FAILURE_TTL_MS, reason: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network-error' };
  }
}

export async function checkRobots(url: string): Promise<RobotsDecision> {
  let origin: string;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return { allowed: false, reason: 'invalid-url' };
    origin = parsed.origin;
  } catch {
    return { allowed: false, reason: 'invalid-url' };
  }
  let entry = cache.get(origin);
  if (!entry || entry.expires < Date.now()) {
    let request = pending.get(origin);
    if (!request) {
      request = load(origin).then(value => { cache.set(origin, value); return value; }).finally(() => pending.delete(origin));
      pending.set(origin, request);
    }
    entry = await request;
  }
  const allowed = entry.allowAll || (entry.robot ? entry.robot.isAllowed(url, CRAWLER_NAME) !== false : false);
  return { allowed, reason: entry.robot ? (allowed ? 'allowed' : 'disallowed') : entry.reason, ...(entry.status === undefined ? {} : { status: entry.status }) };
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  return (await checkRobots(url)).allowed;
}
