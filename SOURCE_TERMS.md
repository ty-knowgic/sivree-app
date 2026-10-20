# 情報源の利用条件の確認（2026-10-20）

有料化の前に、100 件の情報源（88 のサイト）について、発信元の利用条件が Sivry の表示を妨げないかを確かめた記録です。**法的な助言ではありません**。弁護士の確認は受けていません。結果は「確認できた範囲」で、変更されることがあります。

## Sivry が表示するもの
- 見出し、フィードの説明文を100文字以内に短縮したもの、公開日、発信元の名前と種類、原文へのリンク。全文は転載しません。ただし B1（後述）の情報源は、見出しと原文へのリンクだけです。
- 画像は既定で非表示です。オンにすると、利用者の端末が発信元から直接読み込みます（Sivry は保存・配信しません）。
- 取得は公開フィードと `robots.txt` に従い、`SivryBot` と名乗ります。403 は回避しません。
- 意味の近さの判定のために、見出しと説明文から埋め込みベクトルを作ります（定期ジョブの中だけ。記事の本文は使いません）。

## 方法
サイトの規約・著作権のページを機械的に探し、再利用に関する記述を抜き出して、私（Claude）が読みました。ページを取得できなかった・記述を読み取れなかったものは、推測で埋めず「C」または「D」としています。

## 結果の要約
| 区分 | 意味 | フィード数 | 直近30日の記事の割合 |
|---|---|---|---|
| **A** | 再利用が明示されている（商用も可。出典の表示などの条件つき） | 21 | 31% |
| **B1** | 商用での利用・再配布を制限している | 15 | 19% |
| **B2** | 著作権法上の引用の範囲、または条件つき | 8 | 4% |
| **C** | 規約から条件を読み取れない／ページを確認できていない | 50 | 41% |
| **D** | 取得できなかった（403 など） | 6 | 5% |

記事数の多い、A ではない情報源: PR TIMES（259 件）、PR Newswire（222）、カナダ政府（177）、JETRO（96）、NVIDIA（42）、オンタリオ州政府（38）、OpenAI（34）、MIT（30）、@Press（25）。配信サービス4つ（PR TIMES・PR Newswire・Cision Canada・@Press）だけで記事の約24%です。

## A: 再利用が明示されている
| 情報源 | 条件 | 確認したページ |
|---|---|---|
| 首相官邸 | 公共データ利用規約（第1.0版。PDL1.0）。出典の記載が必要。ロゴ等は適用外 | [terms](https://www.kantei.go.jp/jp/terms.html) |
| 総務省 | PDL1.0 | [著作権について](https://www.soumu.go.jp/menu_kyotsuu/policy/tyosaku.html) |
| 財務省 | PDL1.0（国土地理院の地図は別の手続き） | [notice](https://www.mof.go.jp/about_mof/notice/index.html) |
| 金融庁 | PDL1.0 | [rules](https://www.fsa.go.jp/rules/index.html) |
| 厚生労働省 | PDL1.0 | [chosakuken](https://www.mhlw.go.jp/chosakuken/index.html) |
| 文部科学省 | 利用ルールで「商用利用も可能」。PDL1.0 と CC BY 4.0 に互換 | [利用ルール](https://www.mext.go.jp/b_menu/1351168.htm) |
| デジタル庁 | PDL1.0 | [コピーライトポリシー](https://www.digital.go.jp/copyright-policy) |
| 米国務省 | 著作権の表示がなければパブリックドメイン | [copyright-information](https://www.state.gov/copyright-information) |
| FDA | 著作権の対象外（パブリックドメイン）。出典の記載を依頼 | [website-policies](https://www.fda.gov/about-fda/about-website/website-policies) |
| NASA | 米国では一般に著作権の対象外。ロゴや一部の画像は制限 | [images-and-media](https://www.nasa.gov/nasa-brand-center/images-and-media/) |
| カナダ統計局 | Statistics Canada Open Licence（商用・非商用とも制限なし） | [terms](https://www.statcan.gc.ca/en/terms-conditions) |
| カナダ銀行 | 出典を明記すれば自由に利用・複製・配布できる（紙幣の画像は例外） | [terms](https://www.bankofcanada.ca/terms/) |
| ECB | 条件（正確に再掲、出所を明示）つきで自由に利用できる | [disclaimer](https://www.ecb.europa.eu/services/disclaimer/html/index.en.html) |
| 欧州委員会（2件）・同デジタル | 委員会の再利用ポリシー（2011年12月12日の決定）による | [legal-notice](https://commission.europa.eu/legal-notice_en) |
| ECDC | CC BY 4.0 | [IP notices](https://www.ecdc.europa.eu/en/ecdc-intellectual-property-notices) |
| 英国外務省・英国科学・イノベーション・技術省 | Open Government Licence v3.0（除外項目あり） | [gov.uk terms](https://www.gov.uk/help/terms-conditions) |
| arXiv | メタデータ（見出し・要旨）はパブリックドメイン相当（CC0） | [licenses](https://info.arxiv.org/help/license/index.html) |

PDL1.0 と CC BY は、出典の記載と、加工した場合にその旨を示すことを求めます。Sivry は発信元の名前とリンクを常に表示しますが、**「短縮した抜粋である」ことの表示が十分かは未確認**です。

## B1: 商用での利用・再配布を制限している
**対応（2026-10-20 に実施）**: この15件は、見出し・日付・原文へのリンクだけを表示します（説明文・要約・画像は出さず、本文も取得しません）。コードでは `titleOnly` で表します。許諾の依頼は、利用状況とフィードバックを見て判断します。

| 情報源 | 記載の要点 | 確認したページ |
|---|---|---|
| **カナダ政府**（177件） | 非商用の複製は自由。商用での再配布は事前の書面の許諾が必要（別の記載がない限り） | [terms](https://www.canada.ca/en/transparency/terms.html) |
| オンタリオ州政府 | 非商用は無改変・出典明記で可。商用は King's Printer のライセンスが必要（OGL-Ontario の表示つきは別） | [copyright](https://www.ontario.ca/page/copyright-information-c-queens-printer-ontario) |
| ウォータールー・リージョン | 個人・教育・非商用に限る | [terms](https://www.regionofwaterloo.ca/government-and-council/transparency-and-accountability/privacy-and-collection-notices/website-terms-of-use/) |
| ケンブリッジ市 | 個人の非商用に限る | [terms](https://www.cambridge.ca/terms-of-use/) |
| **JPX** | 許諾なき商用目的のデータ収集・二次利用・再配信は不可。生成AI等による学習・解析・生成でも、同サイトに不利益となる利用は禁止 | [term-of-use](https://www.jpx.co.jp/term-of-use/index.html) |
| JETRO・ジェトロ | 事前の許可なく複製・販売・出版・頒布・表示はできない | [legal](https://www.jetro.go.jp/legal.html) |
| JAXA | 私的使用・引用等を除き、事前の許可なく利用しない | [サイトポリシー・利用規約](https://www.jaxa.jp/policy_j.html) |
| KEK | 私的使用・引用等を除き、許可なく複製・転載しない | [利用規約](https://www.kek.jp/ja/terms_of_use) |
| WHO | 研究・私的学習以外、販売・商用目的での複製は不可 | [terms](https://www.who.int/about/policies/terms-of-use) |
| Fraunhofer | 商用の利用・頒布は書面の承認なしに禁止（出版上の注意事項の記載） | [publishing notes](https://www.fraunhofer.de/en/publishing-notes.html) |
| Microsoft Research | サイトは個人の非商用利用に限る | [Microsoft terms](https://go.microsoft.com/fwlink/?LinkID=206977) |
| カーネギーメロン大学 | 個人の閲覧・非商用に限る | [legal](https://www.cmu.edu/legal/) |
| Simons Foundation | 個人の非商用に限る | [terms](https://www.simonsfoundation.org/terms-and-conditions/) |
| CIFAR | 個人の非商用に限る | [terms](https://cifar.ca/terms-of-use/) |

## B2: 著作権法上の引用の範囲、または条件つき
| 情報源 | 記載の要点 | 確認したページ |
|---|---|---|
| GPIF | 私的使用・引用等、著作権法で認められる場合に限り可。出典の記載が必要 | [disclaimer](https://www.gpif.go.jp/disclaimer/) |
| 国立天文台 | 著作権法の自由利用の範囲（私的・教育・引用・報道）で事前の許諾は不要 | [copyright](https://www.nao.ac.jp/terms/copyright.html) |
| JPCERT/CC | 引用は自由。転載・再配布は連絡を依頼 | [guide](https://www.jpcert.or.jp/guide.html) |
| 国連ニュース | 著作権は留保。ニュース関連の素材は、出典を示し国連に知らせれば利用できる | [copyright](https://www.un.org/en/about-us/copyright) |
| MIT（3件） | 再掲載には見出し・署名・MIT News へのリンクなどの条件。画像は非営利の CC BY-NC-ND | [terms](https://news.mit.edu/terms-of-use) |
| @Press | 会員規約が、得た情報の営利目的の利用や第三者への譲渡を禁止（フィードの利用条件は未確認） | [規約](https://www.atpress.ne.jp/term_use/) |

## C: 規約から条件を読み取れない／ページを確認できていない
- **配信サービス**: PR Newswire（4件）、Cision Canada、PR TIMES。PR Newswire の規約は、他の利用者が投稿した内容を、所有者の書面の承認なしに再掲載することや AI の学習に使うことを禁じています。一方、同社の RSS のページはウェブ運営者向けの配信を案内しており、**商用の集約サービスでの扱いは明記がありません**。PR TIMES の規約は、掲載する企業向けのものです。
- **企業・団体のブログ**: NVIDIA（2件）、Google、Google Research、Google DeepMind、Apple、Hugging Face、Ai2、Sakana AI、Sanctuary AI、Clearpath Robotics、Linux Foundation、Partnership on AI、Open Robotics、Vector Institute、トロント大学工学部、京都大学、Kavli IPMU、Clay Mathematics Institute、EMBL、ESA。規約が見つからない、またはサイト利用の規約だけで、フィードの再利用に触れていません。
- **政府・公的機関**: 内閣府、日本銀行、JST（2件）、カナダ首相府、キッチナー市、ウォータールー市、欧州医薬品庁、イングランド銀行、英国 AI Security Institute、WTO、NIST（2件）、NOAA、米CDC、NSF（2件）、米経済分析局、米通商代表部、NTIA、CISA、全米芸術基金、FRB。規約のページを見つけられなかった、または再利用の記載を読み取れませんでした。**米国連邦政府の機関の著作物は、一般に著作権の対象外**（17 U.S.C. §105）ですが、各サイトでの明記は確認していません。

## D: 取得できなかった
防衛省、米国防総省、SEC、欧州理事会、OpenAI、NTT。サイトが 403 を返しました。回避せず、確認していません（防衛省は、検索結果の抜粋に政府標準利用規約〔第2.0版。CC BY 互換〕とありましたが、公式ページは見ていません）。

## これから決めること
1. **B1（記事の約19%）**: 決定済み。見出しと原文へのリンクだけを表示する（2026-10-20）。許諾の依頼（カナダ政府・JPX・WHO・オンタリオ州政府など）は、利用状況とフィードバックを見て判断する。
2. **配信サービス（記事の約24%）**: PR Newswire・PR TIMES・@Press に、商用の集約サービスでの再掲載の可否を問い合わせる。
3. **A の条件の確認**: 出典の記載（実施済み）と、加工の表示（「抜粋」と分かる表示）が足りているか。
4. **JPX の「生成AI等による解析」の条項**: Sivry は埋め込みで解析します。条項は学習・解析で JPX が不利益を被る利用を禁じていて、該当するかの判断が要ります。
5. **C と D の確認の続き**: 記事数の多い順に、規約のページを個別に確認する。

利用条件ページ（[3. 情報源と著作権](https://ty-knowgic.github.io/sivry-app/legal.html#ja-sources)）には、すでに「権利は各発信元に帰属する」「掲載の中止の依頼には速やかに対応する」と書いています。
