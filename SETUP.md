# SETUP：人がやる作業の手順書

Life OS で、人の手で行う作業（アカウント作成・環境変数・デプロイなど）の手順です。
**すべて無料プランで足ります。有料プランへの切り替えは不要です。**

---

## Phase 2：Web と拡張の連携

### 1. Supabase プロジェクトを作る
1. https://supabase.com にサインインし、**New project** で作成（プランは **Free**）。リージョンは Tokyo。
2. 左メニュー **Project Settings → API** を開き、次の3つを控える。
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`（**秘密**。ブラウザ・拡張・Git に置かない）

### 2. テーブルを作る
**SQL Editor** を開き、`supabase/migrations/` の SQL を**番号順に**貼って実行する（Phase が進むと増えます）。
- `0001_init.sql`（Phase 2）
- `0002_tasks_logs.sql`（Phase 3）
- `0003_os_shape.sql`（Phase 5.5。手順は下の「Phase 5.5」）
- `0004_wishlist.sql`・`0005_english_words.sql`・`0006_journal.sql`（Phase 6。手順は下の「Phase 6」）

> Supabase CLI を使う場合は `supabase link` のあと `supabase db push` でも同じです。

### 3. ログイン用ユーザーを作る
1. **Authentication → Users → Add user → Create new user**
2. 自分のメールアドレスとパスワードを入れる（**Auto Confirm User** にチェック）
3. **Authentication → Sign In / Providers → Email** で、新規登録（**Allow new users to sign up**）をオフにする
   （使うのは自分1人だけなので、他の人が登録できないようにする）

### 4. 環境変数を決める
`web/.env.example` をコピーして `web/.env.local` を作り、値を入れる。

| 変数 | 内容 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 手順1の値 |
| `SUPABASE_SERVICE_ROLE_KEY` | 手順1の値（サーバー専用） |
| `LIFEOS_OWNER_EMAIL` | 手順3で作ったメールアドレス |
| `LIFEOS_API_TOKEN` | 拡張・iPhone 用の個人用トークン。`openssl rand -hex 32` で作る |

### 5. 手元で動かして確認する
```sh
cd web
npm install
npm run dev        # http://localhost:3000
```
ログインして Today が開けば成功です。「寝る」を押して、Supabase の **Table Editor → sleep** に1行増えることを確認してください。

### 6. デプロイする（Vercel の Hobby＝無料）
1. https://vercel.com で GitHub と連携し、このリポジトリを **Import**。
2. **Root Directory** を `web` にする。
3. **Environment Variables** に、手順4の変数をすべて登録する（`.env.local` の中身）。
4. Deploy。発行された URL（例 `https://xxxx.vercel.app`）を控える。

### 7. 拡張に URL とトークンを設定する
1. 拡張を最新のものにビルドして読み込み直す（`cd extension && npm run build`、`chrome://extensions` で更新）。
2. 拡張の設定画面 → **Life OS との連携**
   - API の URL：手順6の URL（末尾の `/` は不要）
   - トークン：`LIFEOS_API_TOKEN` と同じ値
3. **連携を保存** を押すと、Chrome が「この URL へのアクセスを許可しますか」と聞くので許可する。
4. 動作確認：ポップアップの **寝る（記録する）** を押し、Web の Today に就寝時刻が出ることを確認する。

> トークンは Chrome の拡張のストレージに保存されます。他人に見せないでください。
> 漏れたら Vercel の環境変数 `LIFEOS_API_TOKEN` を新しい値に変え、拡張の設定も更新してください。

---

## Phase 4：Discord 連携

Discord をリモコンにします。常時起動の Bot は使わず、Web の `/api/discord` が Discord からの操作を受けます。
**先に Phase 2 の Web を Vercel にデプロイしておいてください**（Endpoint URL の保存時に Discord が確認を送るため）。

### 1. Discord アプリを作る
1. https://discord.com/developers/applications → **New Application**（名前は自由。例：Life OS）
2. **General Information** で、次の2つを控える。
   - `Application ID` → `DISCORD_APPLICATION_ID`
   - `Public Key` → `DISCORD_PUBLIC_KEY`
3. 左の **Bot** → **Reset Token** でトークンを作り、控える → `DISCORD_BOT_TOKEN`（**秘密**。登録スクリプトを手元で実行するときだけ使う。Vercel には置かない）。
   同じ画面で **Public Bot** をオフにする。

### 2. 自分のサーバーに入れる
1. Discord で自分専用のサーバーを作る（すでにあればそれでよい）。
2. Developer Portal の **OAuth2 → URL Generator** で、Scopes に **`applications.commands`** だけを選ぶ。
3. 生成された URL を開き、自分のサーバーに追加する。

### 3. 自分のユーザー ID を調べる
Discord の **設定 → 詳細設定 → 開発者モード** をオンにし、自分のアイコンを右クリック → **ユーザーIDをコピー** → `DISCORD_OWNER_ID`。
サーバーの ID（`DISCORD_GUILD_ID`）も、サーバー名を右クリック → **サーバーIDをコピー** で取れます。

### 4. Web に環境変数を入れる
Vercel の Environment Variables に **`DISCORD_PUBLIC_KEY`** と **`DISCORD_OWNER_ID`** を登録し、**Production のデプロイを再デプロイ**する。

> 再デプロイするのは、Deployments の一覧で **`Production` のバッジが付いた行**です。`Preview`（ブランチ用）の行を再デプロイしても、公開中の Web には反映されません。
> 反映されていないと、手順5の Endpoint URL の保存が「認証できませんでした」で失敗します。

### 5. Interactions Endpoint URL を設定する
Developer Portal の **General Information → Interactions Endpoint URL** に
`https://（Vercel の URL）/api/discord` を入れて **Save Changes**。
Discord が確認のリクエストを送り、署名検証が通れば保存できます。保存できないときは、`DISCORD_PUBLIC_KEY` が正しいか、デプロイ済みかを確認してください。

### 6. コマンドを登録する（手元で1回）
```sh
cd web
DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/register-discord-commands.mjs
```
`DISCORD_GUILD_ID` を付けるとそのサーバーにすぐ反映されます。`登録しました：/panel /log /task ...` と出れば成功です。
コマンドの定義を変えたら、同じコマンドで登録し直します。

### 7. 使ってみる
Discord で `/panel` と入力すると、ボタンのパネルが出ます。

| やりたいこと | 操作 |
|---|---|
| 勉強の開始 | パネルの「勉強開始」→ 科目を選ぶ（科目は Web の Today で追加） |
| 部活の開始 | パネルの「部活開始」 |
| 終了 | パネルの「終了」 |
| 寝る / 起きた | `/sleep`、またはパネルのボタン |
| 一言ログ | `/log タグ 本文` |
| 課題を追加 | `/task 課題名 期限`（期限は `10/9`、`明日`、`3日後`、`2026-10-09` など） |
| 今日・今週のまとめ | `/today`、`/week`（パネルのボタンも可） |

> Discord は 3 秒以内の応答を求めます。Vercel の無料プランでは、しばらく使っていないと初回だけ遅れて
> 「アプリケーションが応答しませんでした」と出ることがあります。その場合はもう一度押してください。

---

## Phase 5：iPhone ショートカット連携

手順は `docs/iphone-shortcuts.md` にあります。iPhone だけで進められます（Mac は不要です）。

- iPhone 専用のトークン（`LIFEOS_IPHONE_TOKEN`、20文字以上）を作り、Vercel の環境変数に登録して、**Production** を再デプロイします。
- このトークンで呼べるのは、睡眠とアプリ利用の送信だけです。漏れたら、Vercel の値を新しいものに変えて再デプロイし、ショートカットのヘッダーも更新します。

---

## Phase 5.5：OSとしての形を整える（Settings・決定事項・TikTok など）

**順番が大事です。先に ① データベース、そのあと ② 公開（マージ）、③ 拡張、④ Discord の順に進めてください。**
データベースを更新する前に新しい Web を公開すると、Today などが「テーブルがありません」で開けなくなります。

### ① データベースを更新する（Supabase）
既存のデータは、そのまま残ります（`0003` は、テーブルと列を**足すだけ**です。既存の列・行には触れません）。

1. Supabase の **SQL Editor** → **New query** を開く。
2. `supabase/migrations/0003_os_shape.sql` の中身を貼り付けて **Run**。
   - 手元で、ターミナルから `pbcopy < supabase/migrations/0003_os_shape.sql` を実行して、クリップボードにコピーすると楽です。
3. **Success. No rows returned** と出れば完了。
4. 確認：**Table Editor** に `settings` テーブルが増えている。`tasks` に `subject_id` `category` `priority` `memo`、`logs` に `kind` `title` の列が増えている。既存の行は、列が空（`logs.kind` は `log`）のまま残っている。

### ② Web を公開する
`claude/upbeat-hopper-0jov1f` ブランチを `main` にマージすると、Vercel が自動で公開します（1〜2分）。
公開後、Web を開いて、**下部ナビ（Today / Study / Tasks / Life）** と Today の5つのカードが出ることを確認してください。

> 環境変数 `LIFEOS_WAKE_TIME` は**廃止**しました（Vercel に残っていても害はありません。消して構いません）。
> 起床時刻は、Web の **Settings** が唯一の正です。初期値は `06:15` です。

### ③ 拡張を更新する（Mac）
```sh
git pull origin main   # マージ前なら: git pull origin claude/upbeat-hopper-0jov1f
cd extension
npm run build
```
Chrome（Comet）で `chrome://extensions` を開き、Night Guard の更新ボタン（⟳）を押します。

- **TikTok を対象に加えたため、拡張の権限が増えています**（`tiktok.com` へのアクセス）。読み込み直したときに Chrome が「新しい権限」の確認を出したら、**許可**してください。確認が出ないこともあります（フォルダから読み込んだ拡張では出ないのが普通です）。
- 開いている YouTube などのタブは、再読み込みしてください（PiP の計測用のスクリプトが入るため）。
- 拡張の設定は、Life OS の Settings から**自動で取り込まれます**（接続を保存した直後と、その後は10分ごと）。拡張の設定画面の「今すぐ同期」で、すぐ取り込めます。拡張の設定画面は、接続設定と、同期した値の**表示だけ**になりました（時刻などは、Web の Settings で変更します）。
- Life OS に接続していない拡張は、これまでに保存した値（なければ初期値）で動きます。

### ④ Discord のコマンドを登録し直す
`/decision`（部活の決定事項）と `/tasks`（期限が近い課題の一覧）を足しました。手元で、次を実行してください。

```sh
cd web
node --env-file=.env.local scripts/register-discord-commands.mjs
```

`登録しました：/panel /log /decision /task /tasks /today /week /sleep` のように出れば完了です。

### 動作確認
- Web の **Settings** で起床予定を変える（朝の、制限のない時間に）→ Today の「今寝れば」と、拡張のブロック画面の「いま眠れば」が、その値で計算される。
- 制限中（23:15 以降）に Settings を開くと、**Sleep と Night Guard は編集できない**（画面でも API でも拒否される）。
- TikTok を開く → 23:15 以降はブロック画面になる。
- ログの入力欄を「決定事項」に切り替えて保存 → Life > 決定事項 に出て、キーワードで探せる。

---

## Phase 6：残りの機能（Wishlist・English Words・Journal・Insights）

**順番が大事です。先に ① データベース、そのあと ② 公開（マージ）、③ Discord の順に進めてください。**
データベースを更新する前に新しい Web を公開すると、Today が「テーブルがありません」で開けなくなります（Today が英単語のテーブルを読むため）。
拡張（Night Guard）は**変更していません**。再ビルドも再読み込みも要りません。

### ① データベースを更新する（Supabase）
**まだ `0003` を流していなければ、先に `0003` を流してください**（Phase 5.5 の手順）。そのあと、次の3つを**この順に**流します。
既存のデータは、そのまま残ります（どれも、新しいテーブルを**足すだけ**です。既存のテーブル・列・行には触れません）。

1. Supabase の **SQL Editor** → **New query** を開く。
2. `supabase/migrations/0004_wishlist.sql` の中身を貼り付けて **Run** → **Success. No rows returned**。
3. 同じようにして `0005_english_words.sql` を **Run**。
4. 同じようにして `0006_journal.sql` を **Run**。
   - ターミナルから `pbcopy < supabase/migrations/0004_wishlist.sql` のようにコピーすると楽です。
5. 確認：**Table Editor** に `wishlist_items`、`word_tests`、`english_words`、`word_reviews`、`journal_entries` の5つが増えている。どれも **RLS が有効**（Table Editor の上部に "RLS enabled"）。

> 途中でエラーになったとき：どのファイルまで流したかを確認して、続きから流してください。`create table` のエラー（already exists）が出たファイルは、すでに流してあります。

### ② Web を公開する
`claude/upbeat-hopper-0jov1f` ブランチを `main` にマージすると、Vercel が自動で公開します（1〜2分）。
公開後、次を確認してください。
- 下部ナビが **Today / Study / Tasks / Life / Insights** の5つになっている。
- Today に「英単語」と「Insights」のカードがある。
- Life に「日記」と「Wishlist」、Study に「英単語」の入口がある。

### ③ Discord のコマンドを登録し直す
`/words`（今日の復習とテストまでの日数）と `/journal`（今日の日記）を足しました。手元で、次を実行してください。

```sh
cd web
node --env-file=.env.local scripts/register-discord-commands.mjs
```

`登録しました：…/words /journal` のように出れば完了です。

### 動作確認
- Life > Wishlist：名前だけを入れて追加 →「購入済み」を1タップ → 下の「購入済み」に移る。
- Study > 英単語：「まとめて貼り付ける」に、1行ずつ `apple, りんご` の形で貼る → 登録 → Today に「今日の復習 N語」が出る →「復習する」で、単語 → タップで意味 →「覚えてた」「忘れてた」。
- Life > 日記：勉強やログのある日は、文章が自動で出る。「編集」で直して保存 → 「編集済み」になり、あとからデータが増えても書き換わらない。「自動の文章に戻す」で作り直せる。
- Insights：データが少ないうちは「あと◯件たまると表示されます」が並ぶ。勉強の終了時に効率（1〜5）を入れると、時間帯・長さごとの集計に使われる。
- Discord：`/words`、`/journal`。
