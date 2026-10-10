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
- `0007_motivation.sql`（Phase 7。手順は下の「Phase 7」）

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

---

## Phase 7：Motivation（旧「Motivation Monitor」の統合）

**順番が大事です。① データベース → ② 環境変数と通知 → ③ 公開（マージ）→ ④ Discord のコマンド → ⑤ 旧データの取り込み → ⑥ 旧アプリの通知を止める。**
データベースを更新する前に新しい Web を公開すると、Today が「テーブルがありません」で開けなくなります。
拡張（Night Guard）は変更していません。再ビルドも再読み込みも要りません。

### ① データベースを更新する（Supabase）
既存のデータは、そのまま残ります（`0007` は、新しいテーブルを**足すだけ**です）。`0006` までを流してあることを確認してから進めてください。

1. Supabase の **SQL Editor** → **New query**。
2. `supabase/migrations/0007_motivation.sql` の中身を貼り付けて **Run** → **Success. No rows returned**。
3. 確認：**Table Editor** に `motivation_records` が増えている（RLS が有効）。

### ② 通知の準備（環境変数）
朝8時と夜21時の通知は、Discord の **Webhook** に送ります。

1. Discord で、通知を受け取りたいチャンネルの **チャンネルの編集（⚙）→ 連携サービス → ウェブフック → 新しいウェブフック** を作り、**ウェブフックURLをコピー**。（旧アプリで使っていた Webhook の URL と同じものを使っても構いません。）
2. Vercel の **Settings → Environment Variables** に、次の2つを追加（**Production** に）。
   - `DISCORD_WEBHOOK_URL`：コピーした URL（`https://discord.com/api/webhooks/…`）。**秘密です。Git やチャットに貼らないでください。**
   - `CRON_SECRET`：16文字以上のランダムな文字列（例：ターミナルで `openssl rand -hex 24`）。Vercel の Cron が、これを自動で付けて通知の API を呼びます。
3. **Production を再デプロイ**（環境変数を足しただけでは反映されません。Preview ではなく Production です）。

### ③ Web を公開する
`claude/upbeat-hopper-0jov1f` ブランチを `main` にマージすると、Vercel が自動で公開します。同時に、`web/vercel.json` の **Cron**（2本）が有効になります。

| 通知 | 日本時間 | `vercel.json` の schedule（UTC） | 呼ぶ API |
|---|---|---|---|
| 朝のまとめ | 毎朝 8:00 | `0 23 * * *` | `/api/cron/motivation-morning` |
| 夜の催促 | 毎晩 21:00 | `0 12 * * *` | `/api/cron/motivation-evening` |

- **Hobby（無料）プランの制限**：Cron は **1日1回まで**で、指定した時刻の「1時間のどこか」で動きます（8:00〜8:59、21:00〜21:59 のように、ぴったりにはなりません）。この用途には足ります。制限は変わることがあるので、Vercel の **Settings → Cron Jobs** で、2本が登録されているか確認してください。
- 動作確認（手元のターミナル。`<URL>` は公開した Web の URL）：
  ```sh
  curl -H "Authorization: Bearer <CRON_SECRET の値>" https://<URL>/api/cron/motivation-morning
  ```
  Discord のチャンネルに、昨日のまとめ（または「記録がなかったよ」）が届けば成功です。夜の API は、**今日の記録が済んでいると何も送りません**（`{"sent":false}` が返ります）。
- **ぴったりの時刻に送りたいとき／Cron が使えないとき**（代替案）：`web/vercel.json` の `crons` を空（`"crons": []`）にして、外部のスケジューラから同じ API を呼びます。呼び方は同じで、ヘッダーの値は `CRON_SECRET` か `LIFEOS_API_TOKEN` のどちらでも通ります。
  - 例：**cron-job.org**（無料）で、GET `https://<URL>/api/cron/motivation-morning` を毎日 8:00（タイムゾーンを Asia/Tokyo に）、`…/motivation-evening` を 21:00 に設定し、「Request headers」に `Authorization: Bearer <値>` を足す。
  - 例：GitHub Actions の `schedule`（cron は UTC。遅れることがあります）から `curl` で呼ぶ。トークンは GitHub の Secrets に入れる。
  - Cron と外部スケジューラを**両方**有効にすると、通知が二重に届きます。どちらか一方にしてください。

### ④ Discord のコマンドを登録し直す
`/motiv <項目> <点数>` を足しました。手元で、次を実行してください。

```sh
cd web
node --env-file=.env.local scripts/register-discord-commands.mjs
```

`登録しました：…/motiv` のように出れば完了です。`/motiv` は、今日の記録の**その項目だけ**を更新します（ほかの項目とメモは消えません）。

### ⑤ 旧アプリのデータを取り込む
旧アプリのデータは2か所にあります。**どちらか一方でも、両方でも構いません**（同じ日付は項目ごとにマージされ、何度取り込んでも重複しません）。

**方法 A：ブラウザの localStorage から**（旧アプリをブラウザで使っていたとき）
1. 旧アプリを、いつも使っていた**同じ URL**でブラウザに開く（localStorage は URL ごとに別なので、別の URL では空になります）。
2. 開発者ツールのコンソールを開く（Mac は `Cmd + Option + J`、Chrome / Comet）。
3. 次を貼り付けて Enter：
   ```js
   copy(localStorage.getItem('motivation_monitor_v2'))
   ```
   これで JSON がクリップボードにコピーされます（`undefined` と出たら、その URL にはデータがありません）。

**方法 B：旧サーバー（motivation.db）の API から**
1. 旧アプリのサーバーが動いている状態で、ターミナルから（`<ホスト:ポート>` は旧アプリを開いている URL。例：`localhost:5000`）：
   ```sh
   curl -s http://<ホスト:ポート>/api/motivation > motivation.json
   pbcopy < motivation.json
   ```
   `motivation.json` は、中身を確認したいときのために残しておけます（Git には入れないでください）。

**取り込む**
1. Life OS の **Settings** を開き、いちばん下の **「Motivation の取り込み」** に、コピーした JSON を貼り付けて **確認する**。
2. 件数・期間・「すでにある日付」・不正な行（理由つき）が出ます。不正な行（日付が `YYYY-MM-DD` でない、未知の項目、1〜10 以外の点数など）は**取り込まれません**。
3. 同じ日付で、同じ項目が両方にあって値が違うときだけ、「Life OS の値を残す／旧アプリの値を使う」を選べます。
4. **取り込む** を押す。結果（新しい日付・更新・変更なし）が出ます。

> **日付について**：旧アプリは日付を UTC で作っていたため、**日本時間の朝9時前（0:00〜8:59）に記録した分は、1日前の日付で入っています**。Life OS は取り込み時に日付を直しません（旧データには記録した時刻がなく、どれが朝の記録か分からないため）。気になる日があれば、旧データの JSON の `date` を手で直してから取り込んでください。

### ⑥ 旧アプリの通知を止める（取り込みのあと）
Life OS が同じ時刻に通知を送るので、旧アプリの通知を止めないと**二重に届きます**。取り込みの結果を確認してから止めてください。

- 旧アプリを `python app.py`（など）を起動したターミナルで動かしているなら、そのターミナルで `Ctrl + C`。
- 自動起動している場合（Mac）：`launchctl list | grep -i motiv` で名前を調べ、`launchctl unload ~/Library/LaunchAgents/<名前>.plist`。
- cron で通知を出している場合：`crontab -e` で、旧アプリの行の先頭に `#` を付けて保存。
- サーバーに置いているなら、そのサービス（systemd など）を停止して、自動起動を無効にする。
- 旧アプリの `motivation.db` は、**消さずに残して**おいてください（取り込み直せます）。

### 動作確認
- Today に **Motivation** のカード（未記録なら「今日のモチベを記録」）。カードをタップ → スライダーの画面。
- 6項目を付けて **記録する** → もう一度開くと、今日の値が最初から入っている。付け直して記録すると上書きされる。
- Discord の `/motiv` で1項目だけ記録 → Web を開くと、ほかの項目はそのまま。
- Life > Motivation の **グラフ**（7日 / 30日 / 全期間）と **履歴**。
- 日記に「モチベーションは …」の1行。Insights に、記録が10日分以上たまると、睡眠・Digital・曜日との関係が出る。

---

## 土曜の夜の「制限しない」（Night Guard）
土曜の夜は、日曜の **03:00** まで、Night Guard の制限と通知を出しません（03:00 を過ぎると、いつもどおり Level 2 から朝の自動解除まで制限します）。

1. Web を公開する（`main` にマージ。マイグレーションはありません）。
2. 拡張を更新する（Mac）：`git pull origin main` →`cd extension` →`npm run build` → Comet の `chrome://extensions` で Night Guard の更新（⟳）。
3. 拡張の設定画面で **今すぐ同期** → 「土曜の夜は制限しない」が **日曜の 03:00 まで** と表示されれば反映済みです。

- 時刻の変更・無効化は、Web の **Settings** → Night Guard の「土曜の夜は、次の時刻まで制限しない」で、**日中に**行います。制限しない時間も設定は変更できません（回避の防止）。
- 拡張を更新する前の土曜の夜は、これまでどおり制限されます。

