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
