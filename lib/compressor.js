const sharp = require('sharp');

const MAX_BYTES = 500 * 1024;
const QUALITIES = [90, 80, 70, 60, 50, 40];
const MIN_SHORT_EDGE = 480;

/**
 * 将图片转换为 JPEG 并压缩，尽量控制在 maxBytes 以内。
 * 策略：先逐级降质量；仍超标则等比缩小分辨率后重新尝试。
 * 返回 { data(Buffer), bytes, quality, width, height }
 */
async function toJpeg(inputPath, { maxBytes = MAX_BYTES } = {}) {
  let image = sharp(inputPath, { animated: false, failOn: 'error' })
    .rotate() // 按 EXIF 方向旋转
    .flatten({ background: { r: 255, g: 255, b: 255 } }); // 透明通道白底合成

  let current = image;
  let last = null;
  let scale = 1;

  for (let round = 0; round < 8; round++) {
    for (const q of QUALITIES) {
      const buf = await current
        .jpeg({ quality: q, mozjpeg: true, progressive: true })
        .toBuffer();
      const meta = await sharp(inputPath).metadata();
      const w = Math.round((meta.width || 0) * scale);
      const h = Math.round((meta.height || 0) * scale);
      last = { data: buf, bytes: buf.length, quality: q, width: w, height: h };
      if (buf.length <= maxBytes) return last;
    }
    // 质量降到最低仍超标：缩小分辨率，回到 quality=90 重试
    const shortEdge = Math.min(last.width, last.height);
    if (shortEdge <= MIN_SHORT_EDGE) return last; // 已到下限，接受当前结果
    scale *= 0.85;
    const base = sharp(inputPath, { animated: false, failOn: 'error' }).rotate().flatten({ background: { r: 255, g: 255, b: 255 } });
    current = base.resize({
      width: Math.round(last.width * 0.85),
      height: Math.round(last.height * 0.85),
      fit: 'inside',
    });
  }
  return last;
}

module.exports = { toJpeg, MAX_BYTES };
