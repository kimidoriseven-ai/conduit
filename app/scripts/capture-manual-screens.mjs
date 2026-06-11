// マニュアル用スクリーンショットをデモモード（/confirm/demo）から自動撮影する
// 使い方: npm i --no-save puppeteer-core
//         node scripts/capture-manual-screens.mjs  （dev サーバー起動中に実行）
// 出力: scripts/out/*.png （docs/client-manual/images 等へ手動コピー）
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = resolve(import.meta.dirname, 'out');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 2 });

const shot = async name => {
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`captured: ${name}.png`);
};

// テキストでボタンを探してクリック
const clickButton = async text => {
  await page.evaluate(t => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes(t));
    if (!btn) throw new Error(`button not found: ${t}`);
    btn.click();
  }, text);
};

// 1. 名前入力 → ウェルカム画面
await page.goto(`${BASE}/confirm/demo`, { waitUntil: 'networkidle0' });
await page.type('input[type="text"]', '佐藤 花子');
await clickButton('次へ');
await shot('screen-welcome');

// 2. レビュー画面（先頭）
await clickButton('確認をはじめる');
await page.evaluate(() => window.scrollTo(0, 0));
await shot('screen-review');

// 3. 写真1にOK
await clickButton('✓ OK');
await page.evaluate(() => window.scrollTo(0, 0));
await shot('screen-photo-ok');

// 4. 写真1をNGに変更（コメント欄が開く）
await clickButton('✗ NG');
await page.evaluate(() => {
  const ta = document.querySelector('textarea');
  if (ta) ta.scrollIntoView({ block: 'end' });
  window.scrollBy(0, 60);
});
await page.type('textarea', 'もう少し明るい写真にしてください');
await shot('screen-photo-ng');

// 5. キャプションセクション
await page.evaluate(() => {
  const el = [...document.querySelectorAll('p')].find(p => p.textContent.includes('キャプション・ハッシュタグ'));
  if (el) el.scrollIntoView({ block: 'start' });
  window.scrollBy(0, -70);
});
await shot('screen-caption');

// 6. 完了画面
await page.goto(`${BASE}/confirm/demo/complete`, { waitUntil: 'networkidle0' });
await shot('screen-complete');

await browser.close();
console.log(`done. output: ${OUT}`);
