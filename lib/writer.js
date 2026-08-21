const fs = require('node:fs');
const path = require('node:path');

/**
 * 将描述写入与图片同名的 txt 文件（输出目录中）。
 * 文件内容只保留描述本身：若已存在则追加一句（换行分隔），
 * 不添加时间戳、分隔线等任何额外内容。
 */
function appendDescription(txtPath, description) {
  const dir = path.dirname(txtPath);
  fs.mkdirSync(dir, { recursive: true });

  const line = description.trim();
  if (!line) return txtPath;

  let block = line + '\n';
  if (fs.existsSync(txtPath)) {
    // 确保与前一段之间有空行分隔，但不加入任何标记
    const existing = fs.readFileSync(txtPath, 'utf8');
    if (existing.length > 0 && !existing.endsWith('\n\n')) {
      block = (existing.endsWith('\n') ? '' : '\n') + '\n' + line + '\n';
    }
  }

  fs.appendFileSync(txtPath, block, { encoding: 'utf8' });
  return txtPath;
}

/** 根据图片路径得到同名 txt 路径（替换扩展名） */
function txtPathFor(imagePath) {
  return path.join(path.dirname(imagePath), path.basename(imagePath, path.extname(imagePath)) + '.txt');
}

module.exports = { appendDescription, txtPathFor };
