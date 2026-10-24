import { JSDOM, VirtualConsole } from 'jsdom';
import { parseListDate, type HtmlListEntry } from './htmlList.js';

/** The index has no dates. Read the official masthead; never infer a date from the issue number. */
export function bulletinLinks(html: string, base: string): string[] {
  const dom = new JSDOM(html, { url: base, virtualConsole: new VirtualConsole() });
  try {
    return [...new Set([...dom.window.document.querySelectorAll('td a[href]')].map(a => new URL(a.getAttribute('href')!, base))
      .filter(url => url.origin === 'https://www.irs.gov' && /^\/irb\/\d{4}-\d{1,2}_irb$/i.test(url.pathname))
      .map(url => url.href))].slice(0, 6);
  } finally { dom.window.close(); }
}

export function readBulletin(html: string, url: string, now = Date.now()): HtmlListEntry | undefined {
  const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
  try {
    const d = dom.window.document;
    const title = d.querySelector('h1')?.textContent?.trim();
    const isoDate = parseListDate(d.querySelector('.pubdate')?.textContent ?? '', { japan: false });
    if (!title || !/^Internal Revenue Bulletin: \d{4}-\d{1,2}$/.test(title) || !isoDate || Date.parse(isoDate) > now) return;
    return { title, link: url, isoDate };
  } finally { dom.window.close(); }
}
