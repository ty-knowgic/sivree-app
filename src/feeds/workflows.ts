import type { FeedSource } from '../types.js';

/** Selection aids, not entitlements: free sources remain free. */
export const WORKFLOWS = [
  { id: 'corporate-legal', pack: 'legal', name: '企業法務・規制対応' },
  { id: 'ip-practice', pack: 'legal', name: '知財制度・実務' },
  { id: 'policy', pack: 'legal', name: '政策・立法' },
  { id: 'tax-practice', pack: 'finance', name: '税務実務' },
  { id: 'reporting', pack: 'finance', name: '会計・開示' },
  { id: 'financial-compliance', pack: 'finance', name: '金融規制・AML・制裁' }
] as const;

export function workflowsOf(source: Pick<FeedSource, 'sourceName' | 'label'>) {
  const { sourceName: name, label } = source;
  const ids: string[] = [];
  if (/^(法務省|公正取引委員会|個人情報保護委員会|消費者庁|米連邦取引委員会|欧州データ保護会議|EU 司法裁判所)$/.test(name)) ids.push('corporate-legal');
  if (/^(世界知的所有権機関|欧州特許庁|日本弁理士会|カナダ知的財産庁)$/.test(name) || /Patent and Trademark Office/.test(label)) ids.push('ip-practice');
  if (/^(米政府出版局|e-Gov パブリック・コメント|EUR-Lex|カナダ官報)$/.test(name) || /Significant Final Rules/.test(label)) ids.push('policy');
  if (/^(国税庁|米内国歳入庁|カナダ歳入庁|日本税理士会連合会)$/.test(name) || /Federal Register: IRS /.test(label)) ids.push('tax-practice');
  if (/^(企業会計基準委員会|日本公認会計士協会|金融庁)$/.test(name) || /SEC Rules/.test(label)) ids.push('reporting');
  if (/^(金融庁|SEC|FRB|米商品先物取引委員会|米消費者金融保護局|米通貨監督庁|欧州銀行監督機構|欧州保険・年金監督機構|証券取引等監視委員会|カナダ金融機関監督庁|オンタリオ州証券委員会|金融安定理事会|国際決済銀行|FinCEN|OFAC)$/.test(name) || /Federal Register: (SEC|FinCEN|OFAC) /.test(label)) ids.push('financial-compliance');
  return WORKFLOWS.filter(workflow => ids.includes(workflow.id)).map(workflow => ({ ...workflow }));
}
