# tag-image-local

本地图片反推工具：扫描一个文件夹里的图片 → 统一转 JPG 并压缩（目标 ≤500KB）→ 调用本地 Ollama 视觉模型反推 → 把**一句话描述**（可直接作为图像生成模型的 prompt）写入输出文件夹。

输出文件按规范重命名：`img_XXXX.jpg` / `img_XXXX.txt`（`XXXX` 为从 1 开始的序号，默认补零 4 位）。

## 依赖

- Node.js 18+
- `sharp`（已写入 dependencies）
- 本地已启动的 Ollama 服务，且装有带 **vision** 能力的模型

## 安装

```bash
npm install
# 若 sharp 平台二进制未自动装上：
npm install sharp @img/sharp-win32-x64   # Windows x64
```

## 使用

```bash
node index.js <图片文件夹> [选项]
```

| 选项 | 说明 | 默认 |
|------|------|------|
| `-m, --model` | Ollama 视觉模型名 | `orcarouter/Qwen3.8-27B-Uncensored` |
| `-b, --base-url` | Ollama 服务地址 | `http://localhost:11434` |
| `--max-kb` | 目标文件大小上限（KB） | `500` |
| `-o, --out` | 输出文件夹 | `<图片目录>/output` |
| `--prefix` | 输出文件名前缀 | `img_` |
| `--start` | 序号起始值 | `1` |
| `--pad` | 序号补零位数 | `4` |
| `--skip-done` | 跳过已有同名 txt 的图片 | 关 |
| `-h, --help` | 帮助 | |

示例：

```bash
# 默认：生成 output/img_0001.jpg、output/img_0001.txt ...
node index.js D:\pics

# 自定义命名 + 起始序号 + 补零位数
node index.js D:\pics --prefix photo_ --start 100 --pad 3
#   → photo_100.jpg / photo_100.txt, photo_101.jpg / photo_101.txt ...

# 指定输出目录 + 模型 + 大小上限
node index.js D:\pics -m llava:13b --max-kb 400 --out D:\results --skip-done
```

## 输出

对扫描到的每张图片（按文件名排序），按序号依次生成：

- `output/img_0001.jpg`：转码 + 压缩后的 JPEG
- `output/img_0001.txt`：**一句话**反推描述（可直接用作 SD/SDXL/Flux 等图像生成模型的 prompt）
- `output/img_0002.jpg` / `.txt` ……

> txt 采用**追加**模式：重复运行会在同名文件中累加新的句子（空行分隔，无时间戳/分段标记）。
> 单张失败不中断整批，失败详情写入输出目录下的 `_errors.txt`。

## 压缩策略

1. 逐级降低 JPEG 质量（90→80→…→40），达标即停；
2. 质量降到最低仍超标 → 等比缩小分辨率（每次 ×0.85，短边下限 480px）后从 quality=90 重新尝试；
3. 透明通道自动白底合成；按 EXIF 方向旋转。

## 工作原理

- Ollama API：`POST {baseUrl}/api/generate`，body 携带 base64 JPEG + 反推 prompt，`stream:false`。
- 启动时会 `GET /api/tags` 探测服务并校验模型存在。
- 模型输出会做兜底清理：去掉引号包裹、行内序号、多余空白，保证 txt 里只有干净的描述。

## 目录结构

```
index.js          # 入口 + 主流程 + 命名规范 + 输出目录
lib/scanner.js    # 扫描图片（支持排除输出目录）
lib/compressor.js # sharp 转码 + 多轮压缩
lib/ollama.js     # 调 Ollama 视觉反推（一句话 prompt）
lib/writer.js     # 写/追加同名 txt（纯描述）
```
