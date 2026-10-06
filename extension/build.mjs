// esbuild で src/ をバンドルし、static/ と生成アイコンを dist/ にまとめる。
//   node build.mjs        → dist/      （通常ビルド。デバッグ機能なし）
//   node build.mjs --dev  → dist-dev/  （開発ビルド。仮想時刻のデバッグ機能つき）
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const dev = process.argv.includes('--dev');
const out = dev ? 'dist-dev' : 'dist';

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/icons`, { recursive: true });
cpSync('static', out, { recursive: true });

const manifest = JSON.parse(readFileSync('static/manifest.json', 'utf8'));
if (dev) manifest.name = 'Night Guard (dev)';
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));

// --- アイコン（三日月）を依存なしで生成 ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size - 0.5;
      const ny = (y + 0.5) / size - 0.5;
      const moon = Math.hypot(nx, ny) < 0.32 && Math.hypot(nx - 0.14, ny + 0.06) >= 0.27;
      const [r, g, b] = moon ? [0x8f, 0xb8, 0xff] : [0x1b, 0x23, 0x36];
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw.set([r, g, b, 255], i);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const s of [16, 48, 128]) writeFileSync(`${out}/icons/icon${s}.png`, png(s));

await build({
  entryPoints: {
    background: 'src/background.ts',
    blocked: 'src/blocked.ts',
    popup: 'src/popup.ts',
    options: 'src/options.ts',
  },
  outdir: out,
  bundle: true,
  format: 'iife', // 動的 import（debugPanel）も1ファイルにまとまる
  target: 'chrome116',
  define: { __DEV__: String(dev) },
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  logLevel: 'info',
});
