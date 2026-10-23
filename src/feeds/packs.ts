/**
 * 専門パック（正式版では有償。ベータ中は無料）。フィードの pack はここの ID のどれか。
 * 名前と説明は画面の文言（日本語がキー）なので、public/locales の各言語に訳を置く（scripts/check-source-names.ts が確かめる）
 */
export const PACKS: Record<string, { name: string; blurb: string }> = {
  legal: {
    name: '法務・知財・立法',
    blurb: '新しい法律と重要な規則、裁判所・特許の当局の発表、意見募集、競争・消費者・個人情報の当局の発表（米国・EU・日本）'
  },
  finance: {
    name: '税務・会計・金融規制',
    blurb: '税の規則、証券・デリバティブ・銀行・保険の監督当局、制裁とマネロン対策、監査の監督（米国・EU・日本）'
  }
};
