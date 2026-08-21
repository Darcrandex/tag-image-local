#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { scanImages } = require('./lib/scanner');
const { toJpeg } = require('./lib/compressor');
const { checkOllama, describeImage, DEFAULT_BASE, DEFAULT_MODEL } = require('./lib/ollama');
const { appendDescription } = require('./lib/writer');

const DEFAULT_PREFIX = 'img_';
const DEFAULT_START = 1;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' || a === '-m') args.model = argv[++i];
    else if (a === '--base-url' || a === '-b') args.baseUrl = argv[++i];
    else if (a === '--max-kb') args.maxKb = Number(argv[++i]);
    else if (a === '--out' || a === '-o') args.out = argv[++i];
    else if (a === '--prefix') args.prefix = argv[++i];
    else if (a === '--start') args.start = Number(argv[++i]);
    else if (a === '--pad') args.pad = Number(argv[++i]);
    else if (a === '--skip-done') args.skipDone = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else args._.push(a);
  }
  return args;
}

function usage() {
  return [
    '用法: node index.js <图片文件夹> [选项]',
    '',
    '  <文件夹>        要处理的图片目录（必填）',
    '  -m, --model    Ollama 视觉模型，默认 ' + DEFAULT_MODEL,
    '  -b, --base-url Ollama 地址，默认 ' + DEFAULT_BASE,
    '      --max-kb   目标文件大小上限(KB)，默认 500',
    '  -o, --out      输出文件夹，默认在图片目录下创建 output',
    '      --prefix   输出文件名前缀，默认 img_（生成 img_1.jpg / img_1.txt）',
    '      --start    序号起始值，默认 1',
    '      --pad      序号补零位数，默认 4（如 img_0001）',
    '      --skip-done 跳过已有同名 txt 的图片',
    '  -h, --help     显示帮助',
    '',
    '示例: node index.js D:\\pics -m llava:13b --max-kb 400 --out D:\\results',
    '      node index.js D:\\pics --prefix photo_ --start 100 --pad 3',
  ].join('\n');
}

function makeName(prefix, seq, pad) {
  const n = String(seq).padStart(pad, '0');
  return prefix + n;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }

  const dir = args._[0];
  if (!dir) { console.error(usage()); process.exit(1); }
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    console.error('目录不存在: ' + absDir);
    process.exit(1);
  }

  // 命名规范
  const prefix = args.prefix !== undefined ? args.prefix : DEFAULT_PREFIX;
  const start = Number.isFinite(args.start) ? args.start : DEFAULT_START;
  const pad = Number.isFinite(args.pad) && args.pad >= 1 ? args.pad : 4;

  // 输出目录（默认 <图片目录>/output），并把它从扫描中排除
  const outDir = args.out ? path.resolve(args.out) : path.join(absDir, 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const images = scanImages(absDir, { excludeDirs: [outDir] });
  if (images.length === 0) { console.log('未在 ' + absDir + ' 找到图片文件'); return; }

  // 探测 Ollama
  let models;
  try {
    models = await checkOllama({ baseUrl: args.baseUrl });
  } catch (e) {
    console.error('无法连接 Ollama 服务 (' + (args.baseUrl || DEFAULT_BASE) + '): ' + e.message);
    process.exit(1);
  }
  const model = args.model || DEFAULT_MODEL;
  if (!models.some((m) => m.name === model || m.name.startsWith(model + ':'))) {
    console.warn('警告: 模型 ' + model + ' 不在本地模型列表，仍尝试调用');
  }

  const maxBytes = (args.maxKb || 500) * 1024;
  console.log('找到 ' + images.length + ' 张图片 | 模型: ' + model + ' | 目标 ≤ ' + (args.maxKb || 500) + 'KB');
  console.log('命名规范: ' + prefix + 'XXXX (起始=' + start + ', 补零=' + pad + ') | 输出目录: ' + outDir);
  console.log('─'.repeat(60));

  const t0 = Date.now();
  let ok = 0, fail = 0, skip = 0;
  const errors = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const seq = start + i;
    const base = makeName(prefix, seq, pad);
    const outJpg = path.join(outDir, base + '.jpg');
    const outTxt = path.join(outDir, base + '.txt');
    const label = '[' + (i + 1) + '/' + images.length + '] ' + img.name + ' → ' + base;

    if (args.skipDone && fs.existsSync(outTxt)) {
      console.log(label + '  已存在 txt，跳过 (--skip-done)');
      skip++;
      continue;
    }

    try {
      // 1) 转换 + 压缩
      const { data, bytes, quality, width, height } = await toJpeg(img.full, { maxBytes });
      const kb = Math.round(bytes / 1024);
      const over = bytes > maxBytes ? ' (超出目标 ' + kb + 'KB)' : '';
      fs.writeFileSync(outJpg, data);

      // 2) Ollama 反推
      const desc = await describeImage(data, { baseUrl: args.baseUrl, model });

      // 3) 追加 txt（输出目录中同名）
      appendDescription(outTxt, desc);

      ok++;
      console.log(label + ' (' + kb + 'KB q=' + quality + ' ' + width + 'x' + height + ')' + over + ' ✓ 描述已写入 ' + base + '.txt');
    } catch (e) {
      fail++;
      errors.push(img.name + ' (→ ' + base + '): ' + e.message);
      console.error(label + ' ✗ ' + e.message);
    }
  }

  console.log('─'.repeat(60));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('完成: ' + ok + ' 成功 / ' + fail + ' 失败 / ' + skip + ' 跳过，耗时 ' + secs + 's');
  if (errors.length) {
    const errFile = path.join(outDir, '_errors.txt');
    fs.writeFileSync(errFile, errors.join('\n') + '\n', { encoding: 'utf8' });
    console.log('失败详情已写入: ' + errFile);
  }
}

main().catch((e) => { console.error('未捕获错误:', e); process.exit(1); });
