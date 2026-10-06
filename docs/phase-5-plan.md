# Phase 5 計画：iPhone ショートカット連携

iPhone のネイティブアプリは作らない。ショートカットから Web の API に送る。

## API（どちらも `Authorization: Bearer <LIFEOS_API_TOKEN>`）
- `POST /api/ingest/sleep`：睡眠（Apple Watch 由来）
  - 本文：`{"sleep_at": "...", "wake_at": "..."}`（ISO 8601。タイムゾーンなしは JST として扱う）
  - 同じ夜（朝6時区切り）の自動データは1件にまとめる。同じデータの再送は何度でも安全。
  - ボタンの記録がある夜でも、自動データを優先して集計する。元データ（ボタン）は消さない。
- `POST /api/ingest/app`：アプリの利用
  - 本文：`{"app": "Instagram", "event": "open" | "close", "at": "..."}`（`events` に配列でまとめても可）
  - 同じ (アプリ, 種別, 時刻) は1件。開く→閉じるを組にして利用区間にする（Today で集計）。

## 集計
- iPhone の利用時間は Today の Digital に、Mac とは分けて出す（Phase 2 で実装済み。ここでテストを足す）。
- 23:30 を境目またぐ区間、閉じるのが窓の外（朝）になる区間も、重なる分だけ数える。

## 手順書
`docs/iphone-shortcuts.md`：ショートカット作成（睡眠・アプリ）、毎朝のオートメーション、アプリを開いた時・閉じた時のオートメーション、JSON の形、ヘッダー、動作確認（curl と Today）。

## 完了条件
- API にテストがある（正常系、重複、認証エラー）
- 手順書だけを見てショートカットを作れる
