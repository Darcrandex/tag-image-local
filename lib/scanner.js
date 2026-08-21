const fs = require('node:fs');
const path = require('node:path');

const IMAGE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.gif', '.heic', '.heif',
]);

/**
 * 扫描目录下的所有图片文件（不递归子目录），按文件名排序返回。
 */
function scanImages(dir, { excludeDirs = [] } = {}) {
  const exclude = new Set(excludeDirs.map((d) => path.basename(path.resolve(d))));
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && !exclude.has(e.name) && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => ({ name: e.name, ext: path.extname(e.name).toLowerCase(), full: path.join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { scanImages, IMAGE_EXT };

