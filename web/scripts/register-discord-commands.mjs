// Discord にスラッシュコマンドを登録する（人が1回実行する。SETUP.md を参照）
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... [DISCORD_GUILD_ID=...] node scripts/register-discord-commands.mjs
// DISCORD_GUILD_ID を指定するとそのサーバー限定（すぐ反映される）。省略するとグローバル（反映に時間がかかることがある）。
import { readFileSync } from 'node:fs';

const { DISCORD_APPLICATION_ID: app, DISCORD_BOT_TOKEN: token, DISCORD_GUILD_ID: guild } = process.env;
if (!app || !token) {
  console.error('DISCORD_APPLICATION_ID と DISCORD_BOT_TOKEN を環境変数で指定してください');
  process.exit(1);
}
const commands = JSON.parse(readFileSync(new URL('../src/server/discord/commands.json', import.meta.url), 'utf8'));
const url = guild
  ? `https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`
  : `https://discord.com/api/v10/applications/${app}/commands`;

const res = await fetch(url, {
  method: 'PUT', // 一括で置き換える（定義にないコマンドは消える）
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands),
});
if (!res.ok) {
  console.error(`登録に失敗しました (${res.status})`, await res.text());
  process.exit(1);
}
const registered = await res.json();
console.log(`登録しました：${registered.map((c) => '/' + c.name).join(' ')}`);
