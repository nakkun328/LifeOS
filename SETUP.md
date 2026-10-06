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
| `LIFEOS_WAKE_TIME` | 起床時刻（任意。既定 `06:15`） |

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
