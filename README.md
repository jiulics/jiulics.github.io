# jiulics

这是 `jiulics.github.io` 的 Hugo 博客源码，线上站点：

```text
https://jiulics.github.io/
```

当前使用 `hugo-theme-reimu`，主题作为 Git submodule 放在 `themes/reimu`。旧的 PaperMod 主题已经不再使用。

## 给下次接手的 Codex

先看这几个文件，基本就能知道站点现状：

- `hugo.toml`：站点主配置、菜单、Reimu 参数、头像/背景、favicon 缓存版本。
- `content/posts/`：正式文章。
- `content/research.md`：研究页。
- `static/avatar/avatar.jpg`：侧边栏头像，Reimu 模板实际读取这个路径。
- `static/favicon.ico`：浏览器标签页图标，由头像生成。
- `static/images/generated/blog-bg.png`：当前全站头图/背景。
- `scripts/generate-blog-image.mjs`：可复用的背景图生成脚本。

当前视觉配置要点：

- `theme = 'reimu'`
- `params.banner = 'images/generated/blog-bg.png'`
- `params.avatar = 'avatar.jpg'`
- `params.reimu_cursor = false`，使用系统默认鼠标。
- `params.preloader.enable = false`，不开启动画预加载页。
- `params.firework.enable = false`，关闭点击烟花。
- `params.injector.head_end` 里给 favicon 加了 `?v=avatar-20260522`，用于绕过浏览器 favicon 缓存。

不要提交这些本地产物：`public/`、`resources/_gen/`、`.tools/`、`logs/`、`image/`、`.env.local`、`.tmp-*`、`.codebuddy/`、`.kilo/`。

## 本地预览

项目内自带本地 Hugo 可执行文件，优先用它：

```powershell
.\.tools\hugo\hugo.exe server -D
```

通常打开：

```text
http://127.0.0.1:1313/
```

构建检查：

```powershell
.\.tools\hugo\hugo.exe --gc --minify
```

## 文章维护

正式文章放在：

```text
content/posts/
```

新建文章：

```powershell
.\.tools\hugo\hugo.exe new content posts/my-post.md
```

front matter 建议至少包含：

```yaml
---
title: '文章标题'
date: 2026-05-22T12:00:00+08:00
lastmod: 2026-05-22T12:00:00+08:00
draft: false
tags: ['AI', 'Mamba', '系统优化']
categories: ['状态空间与序列建模']
summary: '一句话摘要。'
cover: 'images/cover-mamba.png'
math: true
---
```

没有公式时删掉 `math: true`。常用分类：

- `状态空间与序列建模`
- `多模态融合`
- `对比学习与弱配准`
- `协同计算与调度`
- `AI 应用工程`

公式写法：

```text
行内：\(x_i\)

块级：
\[
x_i = y_i + z_i
\]
```

不要用单美元符号写行内公式，容易被 Markdown 误解析。

## 图片资源

头像：

```text
static/avatar/avatar.jpg
```

favicon：

```text
static/favicon.ico
```

全站背景：

```text
static/images/generated/blog-bg.png
```

如需重新生成背景图，把密钥放在 `.env.local`，不要提交：

```text
IMAGE2_API_KEY=...
```

然后运行：

```powershell
node scripts/generate-blog-image.mjs --prompt "适合研究型博客的低空无人机、多智能体协作、柔和科技感背景图" --out static/images/generated/blog-bg.png
```

## 发布

提交前先看状态，避免把本地缓存或草稿带上：

```powershell
git status --short
```

发布：

```powershell
git add <需要提交的文件>
git commit -m "Update blog"
git push origin main
```

GitHub Actions 会自动构建并部署到 GitHub Pages。
