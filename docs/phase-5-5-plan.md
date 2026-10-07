# Phase 5.5 計画：OSとしての形を整える

`LIFE_OS_PLAN_2.md` に沿って進める。既存の挙動と食い違う点は `DECISIONS.md` に記録する。

## 最重要：本番データを壊さない
- 既存のマイグレーション（0001・0002）は書き換えない。`0003_os_shape.sql` を足す。
- 列の追加は NULL 許可か既定値つき。既存の行は、そのまま読める。
- 実際の Postgres で、**既存データが入った状態**に 0003 を流して、データが残ることを確認する。

## 作業の順（区切りごとにテスト・コミット・push）
1. **土台（サーバー）**
   - `0003_os_shape.sql`：`settings`（設定の唯一の正）、`tasks` に科目・カテゴリ・優先度・メモ、`logs` に種別（log / decision）と件名
   - Settings API（取得・保存）。**Sleep と Night Guard の設定は、制限中（Level 1・2）は API 側でも拒否**
   - Supabase 実装の `select` を**ページ分割**（1回1000行が上限のため。利用時間の集計が欠けるのを防ぐ）
   - 集計の純粋関数（Study の科目別・タイムライン・先週比、Sleep の週平均、Digital の前日比・サービス別）
   - 決定事項、Tasks の追加項目、Discord の `/decision` と `/tasks`
2. **拡張**
   - 設定を API から取得して手元に保存（オフラインでは最後の値）。設定画面は接続設定と、同期した値の表示だけ
   - TikTok を Level 1 の制限対象と計測対象に追加
3. **画面**
   - 下部ナビ（Today / Study / Tasks / Life）、Today の5枚のカード、Study・Life（Sleep・Digital・ログ・決定事項）・Tasks・Settings
   - レイアウトは、マージ済みのスマホ / PC 対応の上に積む
4. **仕上げ**：`SETUP.md`（マイグレーションの適用、拡張の再読み込み・再許可）、`PROGRESS.md`

## 方針
- 環境変数 `LIFEOS_WAKE_TIME` は廃止。起床時刻は Settings の値を使う。
- 比べる相手は過去の自分。増えた・遅くなった日は、数字だけ出す。
- 主要操作は Today から2タップ以内。
