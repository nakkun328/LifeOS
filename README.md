# Life OS

自分専用の生活記録アプリ。最優先の目的は「Macでの夜更かしを減らして、翌日の遅刻を防ぐ」こと。

| ディレクトリ | 内容 |
|---|---|
| `extension/` | Night Guard（Chrome拡張）。夜の YouTube・X・Instagram を制限し、利用時間を計測する。[README](extension/README.md) |
| `web/` | Life OS Web（Next.js + Supabase）。Today・Study・就寝・Tasks・一言ログ。 |
| `supabase/migrations/` | DB のスキーマ（SQL） |
| `docs/` | 各 Phase の計画書 |

- 作業の進み具合：[PROGRESS.md](PROGRESS.md)
- 決めたことの記録：[DECISIONS.md](DECISIONS.md)
- 人がやる作業（Supabase・デプロイなど）：[SETUP.md](SETUP.md)

## テスト
```sh
cd extension && npm install && npm test
cd web && npm install && npm test
```
