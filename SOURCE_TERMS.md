# 情報源の利用条件の確認（2026-10-20）

## 日本の府省庁の追加と見送り（2026-11-08）

きっかけは省庁の若手が毎朝、各省の発表を横断して見ているという声（[docs/feedback-log.md](docs/feedback-log.md)、運営表 DATA-04）。取得は SivreeBot の名乗りで robots.txt と実際のフィードを確かめた。

| 発信元 | 経路 | 判断 | 確認根拠 |
|---|---|---|---|
| 農林水産省 | `https://www.maff.go.jp/rss.xml`（報道発表の新しい順40件。林野庁・水産庁・農林水産技術会議のものを含む。説明文は空） | **追加**（候補 / A、パックには入れない） | robots.txt は 200 で、禁止は工事関係の書類の配下だけ（`/j/apply/koji/content/` ほか）。[リンクについて・著作権](https://www.maff.go.jp/j/use/link.html): 特記のない限り公共データ利用規約（第1.0版）に準拠して利用でき、出典の記載を求める。写真などの画像は第三者の権利が多いので事前確認を求める → Sivree は見出し・日付・出所・原文リンクだけを出し、画像は既定で非表示。フィードの案内ページ（`/j/pr/rss/index.html`）は SivreeBot に 403 を返したが、フィード本体は 200 で、利用条件は上の著作権の頁で確認できる（回避はしない）。`/j/rss.xml` は 2016 年で止まっているため使わない |

**見送ったもの**

- **警察庁**（`/newlyarrived/rss20.xml`、最新の6件）: フィードは 200、robots.txt は全許可。ただし[RSS 配信の案内](https://www.npa.go.jp/rss/index.html)が、配信された RSS について営利・非営利を問わず、その情報に基づくホームページ・メールマガジンの作成と情報の再配布を「固くお断りします」としている。Sivree が見出しとリンクを並べて表示するのはこれに当たりうるため、**書面の許諾が出るまで入れない**（BC 州・ケベック州と同じ扱い）。許諾を求めるかは Tetsu の判断。
- **環境省・内閣官房・こども家庭庁**: トップページに RSS の案内がない。環境省の[報道発表一覧](https://www.env.go.jp/press/index.html)は行ごとに日付がなく、内閣官房のトップは日付（`dt`）と見出し（`dd`）が別の要素に分かれていて、どちらも現在の `htmlList`（1行に日付と見出しがそろう形）では読めない。こども家庭庁のトップは静的な新着の一覧を持たない。いずれも利用条件は未確認。
- **外務省・経済産業省・特許庁**: 11/7 の確認で robots.txt が bot に 403（今日は再確認していない）。**防衛装備庁**のトップも 403（robots.txt は 200）。回避しない。

## 米国の政治の代替経路（2026-10-30）

米国務省のフィード（`state.gov`）は 2026-10-29 から SivreeBot に HTTP 403 を返し、robots.txt も 403 で読めない。大使館・国連代表部のサイト（同じ基盤）も 403。回避はしない。代わりに次の3経路を、既定ではオフの候補として足した（無償。パックには入れない）。SivreeBot・robots.txt の確認で取得できることを確かめた。

| 追加経路 | 表示・区分 | 確認根拠 |
|---|---|---|
| The White House: Presidential Actions（大統領令・布告・覚書。記念日・記念月の布告は除く） | 候補 / A | [Copyright Policy](https://www.whitehouse.gov/copyright/): 政府が作成した資料は著作権の対象外（連邦法）。第三者の素材は CC BY 3.0。robots.txt は検索ページだけを禁止 |
| The White House: Fact Sheets | 候補 / A | 同上 |
| Federal Register: State Department Sanctions and Determinations（制裁・指定・決定・武器輸出規制だけ） | 候補 / A、業務別「金融規制・AML・制裁」 | 既存の官報 API と同じ Reader Aids の再利用条件。robots.txt は `/api/` を禁止していない |

**使わなかったもの**：ホワイトハウスの全体のニュース（`/news/feed/`。政党間の論争を含む広報文が混ざる）、GovInfo の大統領文書集（DCPD。掲載が約3週間遅れ、過去の文書の再掲載を含む）、米商務省（403）。国務長官の電話会談の記録などは国務省のサイトにしかなく、これらでは代わりにならない。

## 専門パック拡充の差分（2026-10-24、公開前）

新規8経路は既定オフ。利用者の既存の選択を変更しない。6つの業務プリセットは情報源を追加選択する補助であり、無料情報源を有料へ移さない。

| 追加経路 | 表示・区分 | 確認根拠 |
|---|---|---|
| Federal Register Significant Proposed Rules | legal / A、規則案と明示 | 既存の官報APIと同じReader Aidsの再利用条件。最終規則フィードとは別経路 |
| FTC Consumer Protection RSS | legal / A | 既存のFTC Competitionと同じ公式機関のプレスリリース。第三者資料・画像は対象外 |
| FRB Regulatory Policy / Enforcement Actions / Supervision Letters（3経路） | finance / A | https://www.federalreserve.gov/disclaimer.htm のCopyright Informationで、別記がなければ情報はpublic domain、複製・配布可能、出典表示を依頼。第三者素材・ロゴは除外。既存のFRB一般フィードの区分はこの追加で変更しない |
| IRS Internal Revenue Bulletin | finance / A、見出し・号の日付・原典リンクのみ | https://www.irs.gov/about-irs/use-of-content-from-irsgov 。職員が職務で作成した内容の利用条件。号一覧には日付がないため、直近6号のHTMLにある公式mastheadだけを確認し、号ごとに掲載する。本文の抜粋・画像・個別事案への解釈は配信しない。日付のない号・未来の号は推定で補わない |
| SEC Litigation Releases / Administrative Proceedings（2経路） | **無料の追加情報源 / C、見出し・日付・リンクのみ** | https://www.sec.gov/about/rss-feeds で公式の配信URLを確認。サイト固有の再配布許諾は未確定のためAや有料パックへ変更しない。企業提出文書の全件配信や本文転載は行わない |

実測：SivreeBot・robots確認・本番と同じ `fetchFeed` を使い、8経路を連続3回取得して全回成功した。記録は `review/professional-expansion-probe.jsonl`。これはローカル実行の結果であり、GitHub Actionsからの定期取得成功を保証しない。公開前に同環境で確認する。

**保留したもの**：FinCEN Alerts/AdvisoriesとOFAC Recent Actionsはページを読めたが、既存の取得処理がrobots.txtの確認を完了できなかった（disallowed or unavailable）。登録一覧から外し、`deferredExpansionFeeds` に保留仕様だけを保存する。直接取得・別User-Agent・プロキシ変更等で確認処理を迂回しない。利用条件もCのまま。旧OFAC RSSは廃止済みで使わない。

**未実装**：e-Gov法令API・意見募集結果、PPC/FSA/NTAの専用変更追跡、WIPO制度別通知、会計基準の許諾付き取得、施行日や締切の抽出。これらが収録済み・網羅済みであるとは表示しない。現在の業務別ボタンは、登録済み情報源から担当業務と地域に関係するものを追加する機能に限る。

有料化の前に、100 件の情報源（88 のサイト）について、発信元の利用条件が Sivree の表示を妨げないかを確かめた記録です。**法的な助言ではありません**。弁護士の確認は受けていません。結果は「確認できた範囲」で、変更されることがあります。

## Sivree が表示するもの
- 見出し、フィードの説明文を100文字以内に短縮したもの、公開日、発信元の名前と種類、原文へのリンク。全文は転載しません。ただし B1（後述）の情報源は、見出しと原文へのリンクだけです。
- 画像は既定で非表示です。オンにすると、利用者の端末が発信元から直接読み込みます（Sivree は保存・配信しません）。
- 取得は公開フィードと `robots.txt` に従い、`SivreeBot` と名乗ります。403 は回避しません。
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

PDL1.0 と CC BY は、出典の記載と、加工した場合にその旨を示すことを求めます。Sivree は発信元の名前とリンクを常に表示しますが、**「短縮した抜粋である」ことの表示が十分かは未確認**です。

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
| 国連ニュース（2026-10-21 に取得をやめた。robots.txt が SivreeBot の取得を許可しない） | 著作権は留保。ニュース関連の素材は、出典を示し国連に知らせれば利用できる | [copyright](https://www.un.org/en/about-us/copyright) |
| MIT（3件） | 再掲載には見出し・署名・MIT News へのリンクなどの条件。画像は非営利の CC BY-NC-ND | [terms](https://news.mit.edu/terms-of-use) |
| @Press | 会員規約が、得た情報の営利目的の利用や第三者への譲渡を禁止（フィードの利用条件は未確認） | [規約](https://www.atpress.ne.jp/term_use/) |

## C: 規約から条件を読み取れない／ページを確認できていない
- **配信サービス**: PR Newswire（4件）、Cision Canada（2026-10-21 にフィードが無くなり外した）、PR TIMES。PR Newswire の規約は、他の利用者が投稿した内容を、所有者の書面の承認なしに再掲載することや AI の学習に使うことを禁じています。一方、同社の RSS のページはウェブ運営者向けの配信を案内しており、**商用の集約サービスでの扱いは明記がありません**。PR TIMES の規約は、掲載する企業向けのものです。
- **企業・団体のブログ**: NVIDIA（2件）、Google、Google Research、Google DeepMind、Apple、Hugging Face、Ai2、Sakana AI、Sanctuary AI、Clearpath Robotics、Linux Foundation、Partnership on AI、Open Robotics、Vector Institute、トロント大学工学部、京都大学、Kavli IPMU、Clay Mathematics Institute、EMBL、ESA。規約が見つからない、またはサイト利用の規約だけで、フィードの再利用に触れていません。
- **政府・公的機関**: 内閣府、日本銀行、JST（2件）、カナダ首相府、キッチナー市、ウォータールー市、欧州医薬品庁、イングランド銀行、英国 AI Security Institute、WTO、NIST（2件）、NOAA、米CDC、NSF（2件）、米経済分析局、米通商代表部、NTIA、CISA、全米芸術基金、FRB。規約のページを見つけられなかった、または再利用の記載を読み取れませんでした。**米国連邦政府の機関の著作物は、一般に著作権の対象外**（17 U.S.C. §105）ですが、各サイトでの明記は確認していません。

## D: 取得できなかった
防衛省、米国防総省、SEC、欧州理事会、OpenAI、NTT。サイトが 403 を返しました。回避せず、確認していません（防衛省は、検索結果の抜粋に政府標準利用規約〔第2.0版。CC BY 互換〕とありましたが、公式ページは見ていません）。

## 専門職向けの情報源（2026-10-23 に追加）
弁護士・司法書士・弁理士、公認会計士・税理士、アクチュアリー、金融のコンプライアンス担当、ロビイストなど向けに、米国・カナダ・EU・日本の当局と専門職団体のフィードを足しました（`src/feeds/professional.ts`）。すべて既定ではオフの候補です。**利用条件が A のものだけを専門パック**（正式版では有償、ベータ中は無料）に入れ、B1 は見出しと原文へのリンクだけを表示します。C は、上の C の情報源と同じに表示します。確かめ方は上と同じで、`SivreeBot` と名乗り、robots.txt に従い、403 は回避していません。

### A: 再利用が明示されている
| 情報源 | 条件 | 確認したページ | パック |
|---|---|---|---|
| 米連邦官報（Federal Register の API） | 「連邦官報に掲載された資料の再掲載に制限はない」（官報の Reader Aids）。federalregister.gov の HTML は SivreeBot をボット確認のページに転送するため、GovInfo 上の官報で確認 | [Reader Aids](https://www.govinfo.gov/content/pkg/FR-2026-01-30/html/FR-2026-01-30-ReaderAids.htm) | 法務・税務 |
| 米政府出版局（GovInfo） | 米国政府の著作物はパブリックドメイン（17 U.S.C. §105）。第三者の素材は除く | [policies](https://www.govinfo.gov/about/policies) | 法務 |
| 米連邦取引委員会 | 大半はパブリックドメイン。可能な範囲で出典の記載 | [website policy](https://www.ftc.gov/policy-notices/website-policy) | 法務 |
| 米商品先物取引委員会 | パブリックドメインで自由に配布・複製できる。出典の記載を依頼 | [web policy](https://www.cftc.gov/WebPolicy/index.htm) | 税務 |
| 米消費者金融保護局 | パブリックドメイン。許可なく複製・公表・利用できる | [privacy policy](https://www.consumerfinance.gov/privacy/website-privacy-policy/) | 税務 |
| EU 司法裁判所 | 編集記事と判例は、出典を示せば複製できる | [copyright](https://curia.europa.eu/site/jcms/d2_5167/en/copyright) | 法務 |
| 欧州データ保護会議 | 商用・非商用とも再利用を認める。出典の記載が必要 | [copyright](https://www.edpb.europa.eu/copyright_en) | 法務 |
| 欧州銀行監督機構 | 出典を示せば複製を認める | [legal notice](https://www.eba.europa.eu/find-out-about-us/legal-notice) | 税務 |
| 欧州保険・年金監督機構 | 事前の許可なく複製できる。**要約・翻訳など加工して公表する場合は、定められた2点の免責の記載が必要** | [legal notice](https://www.eiopa.europa.eu/legal-notice_en) | 税務 |
| 世界知的所有権機関 | CC BY 4.0（出典の記載と、変更した場合はその旨） | [terms of use](https://www.wipo.int/en/web/terms-of-use) | 法務 |
| e-Gov パブリック・コメント（デジタル庁） | PDL1.0 | [利用規約](https://www.e-gov.go.jp/terms) | 法務 |
| 消費者庁 | PDL1.0 | [利用規約](https://www.caa.go.jp/terms_of_use/) | 法務 |
| 証券取引等監視委員会・公認会計士・監査審査会 | 金融庁のサイト（PDL1.0。上の A の金融庁と同じ） | [rules](https://www.fsa.go.jp/rules/index.html) | 税務 |
| 国土交通省 | PDL1.0 | [リンク・著作権](https://www.mlit.go.jp/link.html) | なし（技術職のパックはこの1件だけになるため） |
| 米会計検査院（GAO） | 米国では著作権の保護の対象外で、許可なく全体を複製・配布できる。GAO の推奨と受け取られる使い方はしない。写真など第三者の素材は除く | [copyright](https://www.gao.gov/copyright) | 税務 |
| 会計検査院（一覧ページ） | PDL1.0。リンクは自由だが、リンクを設定したら「ご意見・ご感想」から URL を知らせるよう依頼している（**未対応。運営者が連絡する**） | [ご利用に当たって](https://www.jbaudit.go.jp/general/term.html) | 税務 |
| 国税庁（一覧ページ） | PDL1.0 | [注意事項](https://www.nta.go.jp/chuijiko/copy.htm) | 税務 |
| 米内国歳入庁（一覧ページ） | 連邦職員が職務で作成・管理した内容は著作権の対象外で、自由に複製できる。出典の記載を依頼。第三者の素材は除く | [use of content](https://www.irs.gov/about-irs/use-of-content-from-irsgov) | 税務 |
| 法務省（一覧ページ） | PDL1.0 | [コンテンツの利用について](https://www.moj.go.jp/hisho06_00280.html) | 法務 |
| 公正取引委員会（一覧ページ） | PDL1.0 | [ご利用案内](https://www.jftc.go.jp/kiyaku/index.html) | 法務 |
| 個人情報保護委員会（一覧ページ） | PDL1.0 | [利用規約](https://www.ppc.go.jp/notice/kiyaku/) | 法務 |

### RSS のない一覧ページ（2026-10-23 から）
フィードを出していない当局の一覧ページ（会計検査院の「注目の検査結果」など）は、ページの表から**見出し・日付・リンクだけ**を読みます（`htmlList`、`src/htmlList.ts`）。取得は RSS と同じく、`SivreeBot` と名乗り、robots.txt に従い、403 は回避せず、公開の処理ごとに1ページだけです。説明文・画像は取らず、記事ページも取得しません（表示は B1 と同じく見出しと原文へのリンクだけ）。ページの構成が変わって読める行がなくなったときは、取得の不調として設定画面に出ます。対象にするのは、利用条件を読んで、見出しとリンクの表示が認められると確かめたページだけです。

### B1: 商用での利用・再配布を制限している（見出しとリンクだけ）
| 情報源 | 記載の要点 | 確認したページ |
|---|---|---|
| カナダ官報・カナダ歳入庁・カナダ知的財産庁 | カナダ政府の利用条件（上の B1 のカナダ政府と同じ） | [terms](https://www.canada.ca/en/transparency/terms.html) |
| カナダ・プライバシー・コミッショナー | 非商用の複製は可。商用の再配布は事前の書面の許諾が必要 | [terms](https://www.priv.gc.ca/en/privacy-and-transparency-at-the-opc/terms-and-conditions-of-use/) |
| オンタリオ州証券委員会 | 非商用・教育・情報の目的に限る許諾。許可なく掲載・表示・頒布できない | [legal](https://www.osc.ca/en/legal) |
| 金融安定理事会 | 商用目的を除き、正確に出典を示せば複製・配布できる | [terms](https://www.fsb.org/terms_conditions/) |
| 国際決済銀行 | 非商用の利用と、限られた抜粋に限る | [terms](https://www.bis.org/about/terms-conditions) |
| 日本公認会計士協会 | 事前の文書による許諾なく、複製・転載・頒布を禁じる（転載料あり） | [ご利用条件](https://jicpa.or.jp/webuse/) |
| 企業会計基準委員会（一覧ページ） | 許可なく複写・転載等を行うことは法律により禁じられている（財務会計基準機構） | [リンクについて](https://www.asb-j.jp/jp/link.html) |
| カナダ金融機関監督庁（一覧ページ） | 非商用の複製は可。商用の再配布は事前の書面の許諾が必要（カナダ政府の利用条件） | [terms](https://www.osfi-bsif.gc.ca/en/terms-conditions) |

### B2: 著作権法上の引用の範囲（見出しとリンクだけ）
| 情報源 | 記載の要点 | 確認したページ |
|---|---|---|
| 日本司法書士会連合会（一覧ページ） | 出所を明示し、私的使用・引用など著作権法上認められた範囲で、引用・転載複製できる | [ご利用について](https://www.shiho-shoshi.or.jp/other/terms_and_conditions/) |

### C: 規約から条件を読み取れない
- **EUR-Lex**: 法的告知のページが SivreeBot に空の応答（202。ボット確認）を返し、読めていません。運営する EU 出版局のサイト自体は CC BY 4.0 ですが、EUR-Lex の条件は EUR-Lex の告知を見るよう案内しています。
- **欧州特許庁**: 法的告知のページは本文がスクリプトで表示され、読み取れません（報道向けの写真等の著作権の記載だけを確認）。
- **米通貨監督庁**: サイトのポリシーに著作権の記載が見つかりません（米国連邦政府の著作物ではあります）。
- **証券監督者国際機構**、**米アクチュアリー基準審議会**、**日本税理士会連合会**、**日本弁理士会**（リンクは自由とするリンクポリシーだけ）: 再利用の条件の記載が見つかりません。
- **日本弁護士連合会**（一覧ページ。サイトについてのページは著作権の表示だけ）、**米連邦最高裁判所**（一覧ページ。サイトの方針に、判決などの著作権・再利用の記載がない）: 見出しとリンクだけを表示します。

### 使わなかったもの
- **利用条件**: NCEES（米国の技術者の試験機関）は商用・公的な利用に加え、許可のないリンクも禁じているため使いません。FINRA は個人の非商用・業務の利用に限り、フィードも PDF のファイル名などが混ざるため使いません。
- **フィードの中身**: ESMA の RSS（記事の日付がない）、カナダ最高裁判所の判決（独自の形式の日付だけで、更新した古い判決も流れる）、IFAC（2023年で更新が止まっている）、EUR-Lex の欧州委員会の提案（日付がない）、日本技術士会（他団体の公募の告知が中心）、米司法省の RSS（報告の締切の一覧）。
- **取得できない（403・robots.txt。回避しない）**: PCAOB、FASB、NAIC、congress.gov、米上院のロビイング開示（lda.senate.gov）、USPTO の RSS、米最高裁判所（robots.txt が /rss/ を禁止）、カナダのロビイング・コミッショナー、オンタリオ州技術者協会（PEO）、オンタリオ州法曹協会、CIRO、欧州議会、EUIPO、OECD、英国知的財産庁、特許庁、経済産業省。
- **公開の処理からは 403（2026-10-23 に外した）**: ESMA のニュースの一覧ページ（利用条件は A。出典を示せば複製を認める）と、カナダ議会の LEGISinfo（B1。複製・利用には許可を求める）。どちらも手元からは取得できたが、GitHub Actions で動く公開の処理からは 403 が返り、記事が1件も載らなかった。データセンターからのアクセスを拒んでいると考え、回避しない。公開の処理を別の場所に移したら、確かめ直す。
- **フィードが見つからない**（下の一覧ページでも読めないもの）: 米司法省の FARA、米連邦裁判所、AICPA、FINTRAC、FRAS Canada、IFRS 財団、EU 透明性登録簿、CEN-CENELEC、衆議院・参議院、日本アクチュアリー会。国税庁・法務省・公正取引委員会・個人情報保護委員会・企業会計基準委員会・日本弁護士連合会・日本司法書士会連合会・IRS・OSFI・米連邦最高裁判所は、一覧ページから読む（上の表）。
- **一覧ページでも読めない**: 官報（日ごとの「全体目次」へのリンクだけで見出しがない）、裁判所の「最近の判例」・USPTO のニュース・欧州会計検査院・CPA Canada（一覧をスクリプトで表示していて、ページに載っていない）、EFRAG（一覧の構成が不揃い）、カナダ会計検査院（一覧・フィードが見つからない）。Engineers Canada は、利用条件が公の目的での表示を禁じるため使わない。

## カナダ政府系サイトの個別確認（2026-10-27）
運営者の疑問「gc.ca には機関が多く、利用条件は機関ごとに違うはずだ。Sivree は見出しを抜き出すだけだが、それでも制限されるのか」に答えるための確認です。**法的な助言ではありません**。弁護士の確認は受けていません。英語のページだけを読み、フランス語版は見ていません。許諾の依頼や問い合わせは、どこにもしていません。取得は `SivreeBot` と名乗り、robots.txt を先に読み、403 はありませんでした。

### 答え
- **条項は機関ごとに違います。** ただし大半は、カナダ政府共通の条項（非商用の複製は無償、商用の再配布は事前の書面の許諾が必要）と同じ文面を各機関が自分のページに載せているだけです。例外は3つです。**統計局**は独自の Open Licence で商用も可。**カナダ銀行**は出典を示せば商用も可（有償サービスでは通知の義務あり）。**国防省**のニュースは国防省の独自の条項に従い、年間総収益が1万カナダドル未満の商用利用を許諾しています（超えると有償ライセンス）。
- **見出し・日付・リンク・発信元名だけでも、共通の条項は例外にしていません。** 条項は見出しにもリンクにも触れず、一部の複製も「for the purposes of commercial redistribution」（商用の再配布を目的とする複製。canada.ca の Terms and conditions）の許諾を求める文面です。したがって「条項が明確に認めている」とは言えません。一方、条項は許諾の範囲を示すもので、著作権法が認める範囲まで禁じるものではありません。短い見出しは保護されにくいと政府自身が案内していますが、文章になった長い見出しまでは言えません。**結論は「明示的な許諾はないが、見出し＋リンクだけならリスクは小さい」までで、断定はできません。**
- **Open Government Licence – Canada は、これらのニュース・フィード・API には一般には適用されません**（下の節）。
- 現在の B1＋`titleOnly`（見出しと原文へのリンクだけ）は、統計局とカナダ銀行を除いて妥当です。ただし首相府の記録に誤りがあります（「既存の記述への注記」）。

### 確認した範囲
- canada.ca のニュース API の直近100件は、すべて www.canada.ca の記事へのリンクでした。含まれる30省庁のうち、記事のフッターが共通条項以外へ案内したのは4つ（国防省・財務省・公共サービス・調達省・国境サービス庁）で、ほかの26は共通条項でした。別に見本を取った公安省・歳入庁・外務省・保健省・CSE・RCMP（2022年の記事）のニュースも共通条項でした。**100件に現れなかった省庁は、フッターを確認していません。知的財産庁の記事のフッターも確認していません**（記事が canada.ca 上にあることだけを確かめました）。
- 以下の記録は、各サイトの条項のページを取得して読んだものです。

### 条項（サイトごと）
| サイト | 適用される条項 | 非商用・商用の複製と出典の表示 |
|---|---|---|
| **canada.ca**（ニュース、`api.io.canada.ca` の API、歳入庁・知的財産庁・ISED・外務省・保健省・公安省の記事ほか） | [Terms and conditions](https://www.canada.ca/en/transparency/terms.html)（2025-09-05 更新）。各記事のフッターが案内 | 別の記載がない限り、非商用の複製は無償・許可不要（正確さに注意、完全な題名と作成者を示す、原文の URL にある版の写しだと示す）。**商用の再配布を目的とする複製は、一部でも事前の書面の許諾が必要**（責任機関に連絡）。第三者の素材は対象外。公式シンボルは商用・非商用とも許可が要る |
| **国防省**（canada.ca 上のニュース） | フッターは [DND/CAF の条項](https://www.canada.ca/en/department-national-defence/services/terms-conditions.html)へ案内し、著作物の扱いは [Crown copyright protected works](https://www.canada.ca/en/department-national-defence/corporate/intellectual-property/crown-copyright.html)（2022-07-22）が定める | 非商用は許可不要。**商用でも、見込みの年間総収益（その著作物を組み込んだ製品・サービスの売上の合計）が1万カナダドル未満なら、無償・非独占の許諾が与えられている**。条件は、無改変、題名と国防省の名の表示、公式の写しだが提携・推奨ではないという表示、所定の定型の出典表示、免責と補償。超えるとライセンスが必要（ページによれば通常は5%のロイヤルティ） |
| 財務省・公共サービス・調達省・国境サービス庁 | 各機関の条項: [財務省](https://www.canada.ca/en/department-finance/corporate/terms-conditions.html)、[公共サービス・調達省](https://www.canada.ca/en/public-services-procurement/terms.html)、[国境サービス庁](https://www.cbsa-asfc.gc.ca/help-aide/in-ai-eng.html) | 共通条項と同じ文面。財務省は、配布する**データ**に OGL-Canada を適用すると別に記載（ニュースではない）。国境サービス庁は商用の許諾を所定の申請書で受け付ける |
| ISED | 記事は共通条項。自サイト用に [Copyright—Written permission](https://ised-isde.canada.ca/site/ised/en/copyright-written-permission)（2018-08-28。商用は許諾が必要、オンライン申請フォームあり） | 共通条項と同じ趣旨 |
| **CSE**（cse-cst.gc.ca）・**サイバーセキュリティセンター**（cyber.gc.ca） | [CSE の条項](https://www.cse-cst.gc.ca/en/corporate-information/terms-and-conditions)（cyber.gc.ca を CSE のサイトとして明記）。cyber.gc.ca のフッターは共通条項へ案内（併存） | 非商用は許可不要（CSE を出典とする、公式版や CSE の推奨と受け取られる表示をしない）。商用の再配布は事前の書面の許諾が必要。**国外からの許諾の依頼は、通常は認めないと明記**。CSE の名称・図形は、事業・製品・サービスと関連づけて使えない |
| **カナダ官報** | フッターが共通条項へ案内。官報独自の著作権の注記は、読んだページには見つからなかった。ほかに [Reproduction of Federal Law Order](https://laws-lois.justice.gc.ca/eng/regulations/SI-97-5/FullText.html) | 共通条項と同じ。命令は、連邦の制定法・規則と、連邦の裁判所・行政審判所の決定と理由を、許可・料金なしで複製できるとする（正確さに注意、公式版と表示しない。商用の制限の記載なし）。Part II の規則そのものはこれに当たるが、Part I の公告・規則案や発行号の題名は当たらない |
| カナダ・プライバシー・コミッショナー（OPC） | [Terms and conditions of use](https://www.priv.gc.ca/en/privacy-and-transparency-at-the-opc/terms-and-conditions-of-use/) | 共通条項と同じ文面（許諾は OPC へ） |
| カナダ金融機関監督庁（OSFI） | [Terms and conditions](https://www.osfi-bsif.gc.ca/en/terms-conditions) | 共通条項と同じ文面 |
| **首相府**（pm.gc.ca） | [Important notices](https://www.pm.gc.ca/en/important-notices) の Ownership and usage | 非商用は許可不要（首相府を作成者、題名を示す、公式版や推奨と受け取られる表示をしない）。商用の再配布は、枢密院事務局（PCO）の書面の許諾がない限り禁止。SNS の画像・動画は全権利留保 |
| **カナダ統計局** | [Terms and conditions](https://www.statcan.gc.ca/en/terms-conditions) → [Statistics Canada Open Licence](https://www.statcan.gc.ca/en/terms-conditions/open-licence)（2025-07-10）、[FAQ](https://www.statcan.gc.ca/en/terms-conditions/open-licence-faq) | 商用・販売・再配布・派生物の作成を無償で許諾（ウェブサイトで公開する出版物・文章を含む。FAQ 3）。条件は、正確な複製、統計局の推奨と誤認させない、出所を偽らない、所定の定型文での出典の表示（項目が多いときは、基準年つきの短縮形と参照リストへのリンクでよいと FAQ 8）、統計局の名称・ロゴ・ドメイン名を許可なく広告等に使わない。第三者の素材は対象外 |
| **カナダ銀行** | [Terms of use](https://www.bankofcanada.ca/terms/) | 内容を自由に使用・複製・配布・送信できる（商用を除く記載なし）。条件は、出典としてカナダ銀行を示す、変更したらその旨を示す、正確さに注意、推奨と誤認させない。**有償のサービスに内容を含める場合は、販売前に、買い手へ「カナダ銀行のサイトで無償で読める」と知らせる義務**。紙幣の画像・ロゴ・第三者の素材は除外。API の利用回数・頻度の上限を回避しない |
| RCMP（rcmp.ca。旧 rcmp-grc.gc.ca から転送） | [Terms and conditions](https://rcmp.ca/en/terms-and-conditions) | 共通条項と同じ文面。現在、Sivree の情報源には入っていない |

### リンク・見出し・自動取得・robots.txt
- **リンク**: 共通条項・CSE・OPC・OSFI・首相府・RCMP・カナダ銀行は、政府が外部サイトへのリンクを免責する規定だけで、外部から政府のサイトへのリンクを禁止も許可もしていません。**統計局と国防省は、許可なくリンクしてよいと明記**しています（テキストのリンクだけ、公式シンボルをナビゲーションに使わない、フレームに埋め込まない）。Sivree は原文へ別タブのテキストリンクで開きます（`public/app.js`）。
- **見出し・短い抜粋・引用**: どのサイトにも特別な規定はありません。共通条項は「一部」の複製も対象にする文面です。
- **自動取得・フィード・API**: 禁止する規定は、読んだ範囲にはありません。ニュースの[購読ページ](https://www.canada.ca/en/news/subscribe-emails.html)は、API の URL を RSS として公開し、日時と原文へのリンクを含むと案内していますが、利用条件の記載はありません（`api.io.canada.ca` の利用規約は見つからず）。官報の [RSS のページ](https://gazette.gc.ca/rss/sc-rb-eng.html)は、フィードが無償で、題名・日付・短い説明を含むと案内しています。統計局のフィードには著作権表示の要素がありますが、サイトの条項は Open Licence を優先しています。カナダ銀行はリクエストの回数・頻度の上限を回避しないよう求めます。
- **robots.txt**（`SivreeBot` として取得し、リポジトリと同じ `robots-parser` で判定）: 現在のフィードの URL と、canada.ca・首相府・OSFI・統計局・カナダ銀行・rcmp.ca の記事のパスは**すべて許可**でした。cyber.gc.ca・cse-cst.gc.ca・gazette.gc.ca・priv.gc.ca・`api.io.canada.ca` は robots.txt がなく（404）、取得してよい扱いです。統計局の www150 は Crawl-delay 2 秒です。

### Open Government Licence – Canada は適用されるか
- 同 licence（[版 2.0](https://open.canada.ca/en/open-government-licence-canada)）は、この licence の条件で提供された情報に適用され、商用を含め出典の表示だけで利用できます。**適用されれば結論が大きく変わりますが、ニュース・フィード・API には適用されません。**
- 理由: canada.ca の共通条項は OGL に触れておらず、ニュースの API・購読ページ・フィードにも licence の表示がありません。財務省の条項は OGL を「配布するデータ」に限っています。open.canada.ca のカタログで OGL の表示がある個別の資料は存在します。ニュース関連では共有サービス省（Shared Services Canada）の記事の一部（2018〜2021年）が登録されていますが、省が選んだ個別の記事で、ニュース全体ではありません。官報の個別の公告も、外務省が資料として登録した例を見つけましたが、官報のフィードには及びません。
- 個別の記事に OGL の表示があれば、その記事は出典の定型表示だけで使えます。Sivree はその表示の有無を見分けていません。

### 著作権法の背景（法律の助言ではありません）
- 条文は Justice Laws Website（2026-10-15 の版）で確認しました。**29条**は、研究・私的な学習・教育・パロディ・風刺のための公正な利用（fair dealing）を侵害としません。**29.1条**（批評・評論）と**29.2条**（ニュース報道）は、出所と、記載があれば作者の名を示すことを条件に、同様に侵害としません。著作物の複製が侵害になるのは、全体または実質的な部分の複製です。
- 政府の [Crown Copyright の案内](https://www.canada.ca/en/canadian-heritage/services/crown-copyright-request.html)は、題名・名前・スローガン・短い語の組み合わせは通常は保護されないが、独創的で特徴のある題名は保護されうるとします。CIPO の[著作権ガイド](https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en/guide-copyright)も、短い1語の題名を保護の対象外としています。ニュースの見出しは文章に近いものが多く、この案内だけで保護されないとは言えません。
- 公正な利用の判断要素（目的・性質・量・代替手段・作品の性質・影響。最高裁の CCH 事件）は記憶にもとづくもので、今回は原文を確認していません。
- **ここから断定できないこと**: 商用のニュース集約アプリが、29条・29.1条・29.2条の目的（研究・批評・ニュース報道）に当たるか。見出しだけの表示が「実質的な部分」の複製か。運営者はカナダ在住で、配信は GitHub Pages（米国）のため、どの国の法が問われるか。条項（許諾の範囲）の外でも、法の例外で許されるか。

### 判定
「見出し＋日付＋原文リンク＋発信元名だけ（説明文・画像なし）を、商用のアプリで表示する」ことについて。(i) 条項が明確に認めている、(ii) 条項は明示していないが妥当な解釈で許される範囲、(iii) 制限される・事前の書面の許諾が必要。
| サイト | 分類 | 推奨の区分 | 根拠 |
|---|---|---|---|
| canada.ca ニュース・API（歳入庁・知的財産庁・ISED・外務省・保健省・公安省ほか） | **(ii)**。ただし文言上は (iii) と読める余地あり | **B1 のまま**（`titleOnly` 維持） | 例外の記載がない。完全な題名・発信元名・原文へのリンクを示す点は、非商用の複製の条件と同じ。見出し・リンクだけで、政府が購読用に公開している項目と同じ範囲。商用の再配布の許諾は得ていない |
| 国防省 | **(i) 条件つき**（年間総収益1万カナダドル未満の間）。超えると (iii) | B1 のまま。収益が出る前に再確認 | 小規模な商用を明示的に許諾。ただし定型の出典表示と補償の条件が要る（画面は未確認だが、定型の表示は出していないと思われる）。総収益はその著作物を組み込んだサービスの売上全体と読め、有償化で超える可能性が高い |
| 財務省・公共サービス・調達省・国境サービス庁 | (ii) | B1 のまま | 共通条項と同じ文面 |
| CSE・cyber.gc.ca | (ii) | B1（未登録。入れるなら `titleOnly`） | 共通条項と同じ文面。国外からの依頼を通常は認めない旨があるが、運営者はカナダ在住。利用者は世界中 |
| カナダ官報（Part I / II） | (ii)。Part II の規則そのものは、命令により (i) | B1 のまま | 配信される項目は誌名・日付・巻号だけの発行号の題名で、独自の表現がほぼない。説明文は出していない |
| OPC / OSFI | (ii) | B1 のまま | 共通条項と同じ文面。OSFI はフィードがなく、一覧ページを読む（条項に自動取得の規定なし） |
| 首相府 | (ii) | **B1（現在は C 扱い・`titleOnly` なし。訂正を推奨）** | 条項が見つかり、商用の再配布は PCO の許諾が必要（共通条項と同じ型） |
| カナダ統計局 | **(i)** | **A のまま**（定型の出典表示の確認を要する） | Open Licence が出版物・文章の商用利用を明示的に許諾。定型の表示は、基準年つきの短縮形が許されるが、現在の画面が足りているかは未確認 |
| カナダ銀行 | **(i)** | **A のまま**（有償化の前に通知の義務を確認） | 商用を除かない自由な利用。有償サービスでは、買い手への事前の通知が条件 |
| RCMP | (ii) | B1（未登録。入れるなら `titleOnly`） | 共通条項と同じ文面 |

### 許諾を求める価値（意見のみ。依頼はしていません）
- **canada.ca ニュース**: 価値あり。最大の B1 で、有償化の前に見出し＋リンクの商用の表示を書面で確認できれば (ii) が (i) になります。ただし責任機関は各省庁で、相手が多く、一括して受ける窓口は確認できていません。件数の多い省庁から、または Canada.ca の運営部門を探して、まとめて問うのが現実的です。
- **国防省**: 収益が1万カナダドルを超えるまでは不要。超える見込みなら、先にライセンスの条件（通常5%）を確認します。
- **CSE・サイバーセキュリティセンター**: 情報源に入れる前に確認する価値があります（セキュリティ担当は Sivree の想定する利用者）。
- **首相府・OPC・OSFI・官報**: 件数が少なく、優先度は低い。官報は題名だけで、必要性はほとんどありません。
- **統計局・カナダ銀行**: 不要。出典の表示と通知の義務を守ります。

### 既存の記述への注記（2026-10-27。元の行は直していません）
1. **B1「カナダ政府」の行**と、専門職向けの B1「カナダ官報・カナダ歳入庁・カナダ知的財産庁」の行: 共通条項の説明は正しい。ただし国防省・財務省・公共サービス・調達省・国境サービス庁の記事のフッターは各機関の条項に案内され、国防省は年間総収益1万カナダドル未満の商用を許諾している。OGL は適用されない。
2. **A「カナダ統計局」の行**（商用・非商用とも制限なし）: 制限はある。定型の出典の表示、統計局の推奨と誤認させない、名称・ロゴ・ドメイン名の使用制限。
3. **A「カナダ銀行」の行**: 出典の表示に加え、変更の表示と、有償サービスでの買い手への事前の通知の義務を記していなかった。
4. **C「カナダ首相府」の記述**（規約のページを見つけられなかった）: 誤り。[Important notices](https://www.pm.gc.ca/en/important-notices) に条項があり、B1 と同じ型。現在のフィード（`src/feeds/core.ts`）は `titleOnly` ではなく説明文を取り込んでいた。**2026-10-27 に `titleOnly` を付けた**（見出し・日付・原文リンクだけの表示になる。フィードの URL は変えていない。既存の記事も、次の収集で説明文と画像が外れる）。この確認の結果、「カナダ首相府」は C ではなく B1。

### 確認できなかった点
- `api.io.canada.ca` の API 自体の利用規約。見つかったのはニュースの購読ページだけです。
- 100件に現れなかった省庁のフッターの条項。国防省・財務省・公共サービス・調達省・国境サービス庁のように独自のものがほかにもありえます。
- 共通条項の「商用の再配布」が、見出し＋リンクだけの表示を含むかどうか。条項に答えはなく、公開された解釈の指針も見つかりませんでした。
- 官報の独自の著作権の注記（読んだページにはなし。検索結果の抜粋には、旧版の PDF が公共サービス・調達省への問い合わせを案内するとあったが、現行の扱いは未確認）。
- 見出しを翻訳・加工していないか。共通の Crown Copyright の案内は、改変・翻訳には非商用でも許諾が要るとするため、見出しはそのまま表示する前提です（パイプラインでは翻訳していないと見たが、全経路は確認していない）。
- 技術メモ: cyber.gc.ca の RSS の URL（`/api/cccs/rss/v1/get?...`）は 301 で Atom の URL（`/api/cccs/atom/v1/get?...`）へ転送され、記事の本文の HTML も含みます（取り込むのは見出し・日付・リンクだけ）。OPC のフィードは、リンクが相対パスで、説明が「News release」だけです。

## 安全保障の情報源を足した（2026-10-27）
日本（防衛省・JPCERT/CC）と米国（国防総省・CISA）にあって、英国・カナダ・フランスにはなかった、安全保障・サイバーセキュリティの窓口を、既定ではオフの候補として足した（`src/feeds/security.ts`）。パックには入れない。2026-10-27 に、取得できること、robots.txt、利用条件を確認した。

| 情報源 | 区分 | 利用条件 | 表示 |
|---|---|---|---|
| カナダ・サイバーセキュリティセンター（cyber.gc.ca。Alerts and Advisories） | **B1** | CSE の[条項](https://www.cse-cst.gc.ca/en/corporate-information/terms-and-conditions)（cyber.gc.ca を対象サイトとして明記）。商用の再配布には事前の書面の許諾が必要。上の「カナダ政府系サイトの個別確認」と同じ型 | 見出し・日付・原文リンクだけ（`titleOnly`）。robots.txt はない（404）ので取得してよい扱い |
| 英国 NCSC | **A** | [Terms and conditions](https://www.ncsc.gov.uk/section/about-this-website/terms-and-conditions)。Open Government Licence v3.0。事前の許諾なしに再利用でき、出典の明示とライセンスへのリンクが条件。第三者の素材・第三者の画像・ロゴは対象外 | robots.txt はない（404） |
| 英国国防省（gov.uk のニュース・声明・発表） | **A** | [GOV.UK の条項](https://www.gov.uk/help/terms-conditions)。内容の大半は Open Government Licence で公開され、サイトは内容を「他のサイトやアプリが使えるフィード」として提供すると書いている | robots.txt は `/search/all*` などだけを禁止（読んでいる Atom は禁止の外） |
| フランス CERT-FR（cert.cyber.gouv.fr） | **A** | [Mentions légales](https://cert.cyber.gouv.fr/mentions-legales/)。明示の例外がない限り Licence Ouverte 2.0（Etalab）。商標・ロゴは別 | robots.txt は `/pdf` `/tar` `/js` `/fonts` `/fiche/` だけを禁止（フィードは禁止の外）。サイトは cert.ssi.gouv.fr から移った |

- 英国国防省は、組織の全文書の Atom に射撃訓練の時間や敷地の管理などの定型文書が混じるため、gov.uk の検索のニュース・声明・発表の Atom（`/search/news-and-communications.atom?organisations[]=ministry-of-defence`）を読む。
- CERT-FR は1日に何件も「複数の脆弱性」の通知が出る（フランス語）ため、件数を6件に絞っている。カナダのセンターもベンダーの修正情報が多く、10件に絞っている。日付は更新日で、更新された古い勧告も新しく並ぶ（JPCERT/CC の「（更新）」と同じ）。
- 確認できなかったもの（推測した URL が 404 や空）: ENISA、NATO、EEAS、CERT-EU。ドイツの BSI は robots.txt が拒否するため取得しない（回避しない）。

## 州・県の政府の情報源を足した（2026-10-27）
カナダの3州と米国の3州の8件を、既定ではオフの候補として足した（`src/feeds/regional.ts`。層は limited で、パックには入れない）。取得は本番と同じ処理（robots.txt を守る・SivreeBot）で確かめ、規約は各サイトのページを読んだ。法律の助言ではない。

| 情報源 | 区分 | 利用条件 | 表示 |
|---|---|---|---|
| マニトバ州政府（news.gov.mb.ca） | **A** | [Copyright Notification](https://www.manitoba.ca/legal/copyright.html)。OpenMB Licence。ほとんどの Crown copyright の資料を、追加の許諾なしに複製・翻案・配布・利用できる。ロゴ・紋章などの標章と、第三者の情報・個人情報は別 | 全文 |
| サスカチュワン州政府 | **B1** | [Copyright](https://www.saskatchewan.ca/copyright)。非商用の複製は可（正確に複製し、公式版と見せない）。「商用目的の複製には事前の書面許諾が要る」 | 見出しのみ |
| ニューファンドランド・ラブラドール州政府 | **B1** | [Copyright](https://www.gov.nl.ca/disclaimer/)。「公衆と非政府組織が使用することを許可する」。企業を含むか読み取れないため保守的に B1。映像・音声など第三者の素材は複製不可 | 見出しのみ |
| カリフォルニア州知事室・司法省・プライバシー保護庁 | **A** | 州の共通条項（[知事室](https://www.gov.ca.gov/conditions-of-use/)・[司法省](https://oag.ca.gov/conditions)・[プライバシー保護庁](https://privacy.ca.gov/conditions-of-use/)）。「原則パブリックドメインで、法が許す範囲で配布・複製できる。ただし写真など第三者の著作物は追加の許諾が要りうる」 | 知事室は見出しのみ（フィードの説明が写真の縮小画像と「Source」のリンクだけで要約にならず、写真の権利も残りうるため）。司法省・プライバシー保護庁は全文 |
| テキサス州知事室 | **B1** | [Site Policies](https://gov.texas.gov/site-policies)。写真・動画は許可なく使えない。「サイトのいかなる部分の複製の商用利用も厳禁」 | 見出しのみ |
| ニューヨーク州金融サービス局 | **B1** | [Disclaimer](https://www.dfs.ny.gov/disclaimer)。非商用の複製・配布を許可（内容を変えず、金融サービス局が提供したと明記）。商用は書かれていない。RSS がなく、報道発表の一覧（`/press-room`）を `htmlList` で読む | 見出しのみ |

- **置かなかったもの（フィードは取れる）**: BC 州（[Copyright](https://www2.gov.bc.ca/gov/content/home/copyright)。「事前の書面許諾なしに複製・再配布してはならない」。商用・非商用の区別がない。許諾はフォームで申請する）、ケベック州（[Copyright](https://www.quebec.ca/en/copyright)。「事前の許可なく複製・保存・公表することを禁じる」。申請は目安15営業日。フランス語）。見出しと原文へのリンクだけの表示がこの文言に当たるか読み取れないため、許諾を得るまで置かない。申請は外部への送信なので、ユーザーの OK を得てから行う。
- **置かなかったもの（理由が別）**: アルバータ（規約は SK と同じ型だが、RSS は項目が空）、ノバスコシア（RSS が XML として読めない）、ニューブランズウィック・プリンスエドワードアイランド（フィードの場所が分からない）、準州（403 か robots.txt のタイムアウト）、証券当局 BCSC・ASC・AMF・CSA（HTML が返る・404・403・空）。
- **米国で置かなかったもの**: ニューヨーク州知事室・同司法長官（403）、テキサス州司法長官（RSS なし）、フロリダ・マサチューセッツ（403）・イリノイ（robots.txt を確認できない）・ペンシルベニア・ニュージャージー（フィードなし）、ワシントン州知事室（フィードが2025年1月で止まっている）、ワシントン州司法長官（フィードは取れるが規約のページが見つからない）、カリフォルニア州金融保護・革新局（フィードが空）。
- 米国務省・公取委などで、GitHub Actions からだけ 403 になった例がある。追加後の最初の収集で、`sources.json` の状態を確かめる。

## これから決めること
1. **B1（記事の約19%）**: 決定済み。見出しと原文へのリンクだけを表示する（2026-10-20）。許諾の依頼（カナダ政府・JPX・WHO・オンタリオ州政府など）は、利用状況とフィードバックを見て判断する。
2. **配信サービス（記事の約24%）**: PR Newswire・PR TIMES・@Press に、商用の集約サービスでの再掲載の可否を問い合わせる。
3. **A の条件の確認**: 出典の記載（実施済み）と、加工の表示（「抜粋」と分かる表示）が足りているか。欧州保険・年金監督機構は、要約など加工した場合に免責の記載を求めるため、説明文の短縮がこれに当たるかも合わせて判断する。
4. **JPX の「生成AI等による解析」の条項**: Sivree は埋め込みで解析します。条項は学習・解析で JPX が不利益を被る利用を禁じていて、該当するかの判断が要ります。
5. **C と D の確認の続き**: 記事数の多い順に、規約のページを個別に確認する。

利用条件ページ（[3. 情報源と著作権](https://sivree.com/legal.html#ja-sources)）には、すでに「権利は各発信元に帰属する」「掲載の中止の依頼には速やかに対応する」と書いています。
