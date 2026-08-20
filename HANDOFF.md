# dot-miru 現状・評価・引き継ぎレポート

作成日: 2026-08-20  
対象ブランチ: `feature/d1-profile-storage` (`c20d163`)  
対象: 現在の作業ツリー（未コミット変更を含む）

## 1. 要約

dot-miru は、dotfiles の情報を TOML から読み取り、共有可能なプロフィールとして表示する Astro 製の Web アプリケーションである。Cloudflare Workers 上で SSR し、サイト内で直接公開したプロフィールは Cloudflare D1 に保存する。

現在は次の2つの公開経路が実装済みである。

1. エディターから D1 へ匿名で公開し、短い `/p/<id>` URLを共有する。
2. GitHub/Gist の raw TOML URLを `src/data/profiles.toml` に登録し、トップページと `/u/<slug>` に掲載する。

ビルド、型検査、既存の単体テストはすべて成功しており、MVPとして一通り利用できる状態である。入力サイズ制限、URL制約、暗号学的乱数、編集キーのハッシュ保存、作成レート制限、production/preview のD1分離など、安全性を意識した設計も入っている。

一方で、今後プロフィール数や利用者が増える前に、エディターの分割、API/D1の統合テスト、トップページの外部プロフィール取得方式、運用・監視方針を整備したい。現状は「機能は揃っているが、保守性と運用設計が次の課題」という段階である。

## 2. 技術構成

| 領域 | 採用技術・方式 |
| --- | --- |
| フレームワーク | Astro 7、server output（SSR） |
| 実行環境 | Cloudflare Workers、`@astrojs/cloudflare` |
| 永続化 | Cloudflare D1（SQLite） |
| 入力形式 | TOML (`smol-toml`) |
| バリデーション | Zod 4 |
| テスト | Vitest 4 |
| 言語・型 | TypeScript strict、Astro check |
| パッケージ管理 | Bun 1.3.13 |
| デプロイ管理 | Wrangler 4、production/preview環境を分離 |

主要依存は少なく、構成は意図的に軽量である。フロントエンドフレームワークや状態管理ライブラリは使わず、Astroコンポーネントとブラウザ標準APIで完結している。

## 3. ディレクトリと責務

```text
src/
├── components/
│   ├── ProfileView.astro    # プロフィール本体、画像拡大、共有操作
│   ├── ProfileCard.astro    # トップページの登録プロフィールカード
│   └── SourceForm.astro     # raw TOML URL入力（現在は参照なし）
├── data/
│   └── profiles.toml        # PRで管理するディレクトリ登録情報
├── layouts/
│   └── BaseLayout.astro     # HTML head、共通ヘッダー/フッター、言語切替
├── lib/
│   ├── profile.ts           # TOMLスキーマ、変換、外部取得、キャッシュ
│   ├── stored-profile.ts    # D1 CRUD、ID/編集キー生成・検証
│   ├── api-request.ts       # JSONサイズ制限、Bearer編集キー解析
│   ├── registry.ts          # profiles.toml の読込・検索
│   └── i18n.ts              # en/ja判定、langクエリの付加
├── pages/
│   ├── index.astro          # トップ、sourceクエリ表示、一覧
│   ├── editor.astro         # TOML作成・読込・公開・更新・削除
│   ├── docs.astro           # 利用方法（現在は未追跡ファイル）
│   ├── p/[id].astro         # D1プロフィール表示
│   ├── u/[slug].astro       # 登録済み外部プロフィール表示
│   └── api/                 # 外部TOML取得API、D1プロフィールCRUD API
└── styles/                  # 共通、プロフィール、エディターCSS

migrations/
└── 0001_create_profiles.sql # profilesテーブル作成

tests/
├── profile.test.ts          # URL、TOML、外部取得キャッシュ
└── stored-profile.test.ts   # 作成・サイズ・APIリクエスト解析
```

## 4. 主要な処理フロー

### 4.1 D1へ直接公開

1. `/editor` がフォーム入力から TOML を生成する。
2. `POST /api/profiles` が JSON とTOMLを検証する。
3. 16 byteの公開IDと32 byteの編集キーを Web Crypto で生成する。
4. D1にはTOML、編集キーのSHA-256ハッシュ、作成・更新時刻だけを保存する。
5. ブラウザへ `/p/<id>` と `/editor?id=<id>#key=<edit-key>` を返す。
6. 更新・削除時はフラグメント内のキーをBearerトークンとして送り、D1上のハッシュと照合する。

URLフラグメントは通常HTTPリクエストに送信されないため、編集キーをクエリに置くより漏えいにくい。サーバーが平文キーを保存しない点も妥当である。ただし、キーの再発行や復旧はできない仕様であり、UIとドキュメントで明示している。

### 4.2 GitHub/Gistから表示

1. `src/data/profiles.toml` の `slug` と `source` をビルド時に読み込む。
2. `/u/<slug>` またはトップページが raw TOML を取得する。
3. 取得先を `raw.githubusercontent.com` と `gist.githubusercontent.com` のHTTPS `.toml` に限定する。
4. 最大3回のリダイレクトについても同じ許可条件を再検証する。
5. 1MBを上限として読み込み、Zodスキーマで検証して表示モデルへ変換する。
6. Cache APIで3分をfresh、最大3日を障害時のstaleデータとして保持する。

この経路ではSSRFの対象をホスト許可リストで狭め、レスポンスサイズもヘッダーと実データの両方で制限している。

## 5. 現在のデータモデルとAPI

### D1

`profiles` テーブルは以下の最小構成である。

- `id`: URL-safeな22文字ID、主キー
- `toml`: 最大1MBの元データ
- `edit_key_hash`: 編集キーのSHA-256値
- `created_at`, `updated_at`: Unix time（ミリ秒）

### HTTP API

| Method / path | 用途 | 認証 |
| --- | --- | --- |
| `GET /api/profile?source=...` | 許可済みraw URLの取得・解析 | なし |
| `POST /api/profiles` | D1プロフィール作成 | なし、IP単位のRate Limiting |
| `GET /api/profiles/<id>` | 元TOMLの取得 | なし |
| `PUT /api/profiles/<id>` | TOML更新 | Bearer編集キー |
| `DELETE /api/profiles/<id>` | 削除 | Bearer編集キー |

`GET /api/profiles/<id>` がTOMLを公開するのは、編集キーなしで「閲覧用コピー」としてエディターに読み込める現在の仕様による。TOMLへ将来非公開項目を追加する場合は、この公開性を再検討する必要がある。

## 6. 現状の品質評価

### 総合評価

| 観点 | 評価 | コメント |
| --- | --- | --- |
| 機能完成度 | 良好 | 作成、表示、共有、更新、削除、外部登録まで主要導線が揃う |
| セキュリティ | 良好 | 取得先制限、サイズ制限、Web Crypto、ハッシュ保存、作成制限あり |
| 型・入力境界 | 良好 | strict TypeScript、Zod、生成済みWorker binding型を利用 |
| テスト | 要強化 | 純粋ロジックはカバーするが、D1 CRUDとAPI/画面の統合検証が不足 |
| 保守性 | 普通 | lib層は明瞭だが、`editor.astro` が1,008行で責務が集中 |
| スケーラビリティ | 要改善 | トップ表示時に登録された全raw TOMLを並列取得する |
| 運用性 | 普通 | preview分離とログはあるが、CI、保持期限、復旧手順が未整備 |
| ドキュメント | 改善中 | READMEは詳しい。新docsは未コミット、古いplan/helpは乖離あり |

### 良い点

- TOMLの解析と表示モデルへの変換が `src/lib/profile.ts` に集約され、UIから分離されている。
- 外部取得はHTTPS、許可ホスト、`.toml`、リダイレクト回数、1MB上限を確認している。
- 外部障害時に最大3日間のstaleプロフィールへフォールバックできる。
- 編集キーと公開IDを分離し、暗号学的乱数を使用し、平文キーを保存しない。
- リクエスト本文をストリームで上限まで読み、巨大JSONによるメモリ消費を抑えている。
- productionとpreviewでWorker名、D1、Rate Limiterを分離している。
- `compatibility_date` は作成日と同日、`nodejs_compat` とobservabilityも設定済みで、現行Cloudflare Workersの基本方針に沿っている。
- `worker-configuration.d.ts` はWranglerから生成され、`DB` と `PROFILE_CREATE_RATE_LIMITER` の型が設定と一致している。
- 日本語・英語の表示、画像alt、dialog、ステータス通知など、アクセシビリティへの配慮が見える。

## 7. 課題とリスク

### 優先度: 高

#### 1. トップページの外部取得数が登録件数に比例する

`src/pages/index.astro` はリクエストごとに `registry` の全項目へ `loadProfile()` を並列実行する。キャッシュヒット時は軽いが、新規PoPや期限切れ時には登録数分の外部サブリクエストと待ち時間が発生する。件数増加によりトップページの信頼性とレイテンシが外部ホストへ強く依存する。

対応案:

- 一覧用の名前、概要、OSを登録データまたはビルド成果物へ持たせる。
- 定期処理で一覧メタデータをD1/KVへ同期し、閲覧リクエストでは外部取得しない。
- 当面は同時実行数、タイムアウト、表示件数上限を設ける。

#### 2. `editor.astro` に責務が集中している

HTML、日英文言、TOML変換、入力検証、DOM操作、ファイル読込、API通信、編集キー管理が1ファイル1,008行に入っている。修正時の影響範囲が広く、TOML生成・読込の回帰をブラウザなしで検出しにくい。

対応案:

- TOMLのフォームモデル変換を `src/lib` の純粋関数へ切り出す。
- APIクライアント、credential dialog、繰り返しフォームを分割する。
- 日英文言を辞書化する。
- round-trip（TOML → form model → TOML）を単体テストする。

#### 3. APIとD1 CRUDの統合テストがない

現在の11テストは重要な純粋ロジックを確認しているが、`getStoredProfile`、`updateStoredProfile`、`deleteStoredProfile`、各API route、実D1 migration、認証成功/失敗、404/413/422/429の結線を網羅していない。

対応案:

- Cloudflare Workers向けVitest環境またはローカルD1でAPI統合テストを追加する。
- 更新キー不一致、削除、存在しないID、競合する更新を明示的に試験する。
- 最低限のブラウザE2Eとして作成→表示→更新→削除を通す。

### 優先度: 中

#### 4. 運用上の保持・乱用対策が未定義

匿名プロフィールは削除されるまで残り、所有者を復旧する手段もない。IP/PoP単位の作成レート制限はあるが、長期的なストレージ増加、放置データ、通報・管理削除の手順は定義されていない。

対応案:

- 利用規約、禁止内容、通報・管理削除の手順を決める。
- 最終更新からの保持期間、論理削除、バックアップ方針を決める。
- 作成数、エラー率、D1サイズを観測するダッシュボード/アラートを用意する。

#### 5. HTTPステータスとSEOメタデータが弱い

`/p/<id>` の不存在はエラー画面をHTTP 200で返し、未登録 `/u/<slug>` はトップへ302リダイレクトする。検索エンジンや監視からは「見つからない」と判定しにくい。またOG画像と説明は全ページ共通で、canonical URLもない。

対応案:

- 不存在時は `Astro.response.status = 404` とする。
- プロフィール名・概要・画像をOG metadataへ反映する。
- canonical、必要に応じてrobots方針を追加する。

#### 6. registryの検証が最小限

`registry.ts` は `slug` と `source` が文字列かだけを確認する。重複slug、不正slug、不許可URLは実行時まで検出されず、失敗したカードもslugだけで表示される。

対応案:

- Zodでslug形式、sourceの許可条件、重複をビルド時に検証し、問題があればビルドを失敗させる。
- 登録URLをrevision固定にするか最新版追従にするか、運用ルールを明文化する。

#### 7. CIが見当たらない

ローカルでは成功しているが、PRごとに `bun test` と `bun run build` を必須化する設定がリポジトリ内にない。Cloudflare Git integrationはデプロイを担うが、変更のマージ前ゲートとしては別途CIが望ましい。

### 優先度: 低

- `SourceForm.astro` は現状どこからも参照されておらず、削除するか直接raw URLを開く導線として復活させるか決めたい。
- エディター内の入力エラーや補助文言の一部は日本語表示でも英語のままで、i18nが完全ではない。
- `loadProfile()` の `cache.put()` を応答前に待つため、キャッシュ書込時間が表示レイテンシに入る。Astro/Cloudflareの実行コンテキストへ安全に渡せるならバックグラウンド化を検討できる。
- 外部TOMLが一時的に不正になった場合は、取得障害と異なりstale値へフォールバックせずエラーになる。この挙動が意図通りか決める必要がある。
- `plan.md` は旧スキーマ（`host`、配列の`logo`、文字列画像、TOMLで無効な`//`コメント等）を含み、現仕様の根拠として使えない。
- `help.md` の内容は新しい `/docs` と重複しており、統合後にどちらを残すか決めたい。

## 8. 未コミットの作業

調査時点の `git status --short`:

```text
 M src/layouts/BaseLayout.astro
 M src/pages/index.astro
 M src/styles/global.css
?? help.md
?? src/pages/docs.astro
```

変更内容は主にドキュメント導線とアクセシビリティ改善である。

- 共通フッターへ `/docs` リンクを追加。
- `/docs` に公開方法、編集キー、ディレクトリ登録、TOML/画像の説明を追加。
- wordmarkと英語固定ヒーロー見出しへ `lang="en"` を追加。
- フッターのレイアウトCSSを追加。
- `help.md` に日本語の短い仕様メモを追加。

この一連の変更はビルドと型検査を通過している。引き継ぎ時には、`help.md` を `/docs` の下書きとして削除・統合するか、独立した内部メモとして残すかを決めてからコミットするとよい。

## 9. 検証結果

2026-08-20時点、現在の未コミット変更を含む状態で実行した。

```text
bun test
  11 passed / 0 failed

bun run build
  astro check: 23 files, 0 errors, 0 warnings, 0 hints
  Cloudflare server build: success
```

既存テストが確認している範囲:

- GitHub/Gist raw URLの許可・拒否とGist URL正規化
- 安全なリダイレクトと不許可ホストの拒否
- 外部障害時のstale cache利用
- TOMLスキーマ変換とhidden dotfile除外
- 公開ID/編集キーの形式、キーを平文保存しないこと
- TOMLサイズとJSONリクエストサイズ
- Bearer編集キーの形式

## 10. 推奨する次の進め方

1. 現在の `/docs` 追加を整理し、`help.md` との重複を解消してコミットする。
2. D1 CRUD/APIの統合テストを追加し、CIで `bun test` と `bun run build` を必須化する。
3. エディターのTOML変換を純粋関数として切り出し、round-tripテストを追加する。
4. registryの厳格なビルド時検証を追加する。
5. 登録数が増える前にトップページ一覧の取得方式を見直す。
6. 404、OG/canonical、匿名データの保持・管理削除・監視を整備する。

短期的には1〜3を優先すると、安全に機能追加できる土台ができる。4〜6は公開プロフィール数やアクセスが増える前に着手したい。

## 11. 運用コマンド

```sh
# 開発
bun install
bun run dev

# 検証
bun test
bun run build

# ローカルD1 migration
wrangler d1 migrations apply dot-miru-profiles --local

# preview
bun run deploy:preview

# production（build → migration → deploy）
bun run deploy
```

注意: 非productionブランチをrootのproduction Worker設定でアップロードしないこと。previewは `--env preview` を使い、`dot-miru-preview` と `dot-miru-profiles-preview` を維持する。

## 12. 引き継ぎ時に確認すべき意思決定

- D1へ匿名公開したプロフィールを無期限保存するか。
- 管理者による削除・通報対応をどう行うか。
- raw TOMLを使うディレクトリを今後もPR管理にするか。
- トップページの一覧メタデータを静的化/D1/KV同期するか。
- 日本語・英語対応を全UI文言まで完全に維持するか。
- `/api/profiles/<id>` の元TOML公開を恒久仕様とするか。
- `help.md` と `plan.md` を更新して残すか、README・`/docs`へ統合するか。
