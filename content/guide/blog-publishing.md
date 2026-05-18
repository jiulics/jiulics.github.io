---
title: '博客发布与维护手册'
date: 2026-05-11T11:20:00+08:00
draft: false
summary: '记录 jiulics 博客的本地预览、写作、修改、提交和发布流程。'
hiddenInHomeList: true
hideMeta: true
---

这篇手册用于记录博客维护流程。平时写文章、改文章、发布到 GitHub Pages，都按这里来。

## 本地预览

在项目目录 `D:\blog` 运行：

```powershell
.\.tools\hugo\hugo.exe server -D
```

打开 Hugo 输出的地址，通常是：

```text
http://localhost:1313/
```

## 新建文章

```powershell
.\.tools\hugo\hugo.exe new content posts/my-post.md
```

然后编辑 `content/posts/my-post.md`。正式发布时，文章头部建议包含：

```yaml
---
title: '文章标题'
date: 2026-05-11T12:00:00+08:00
draft: false
tags: ['AI', 'Mamba', '系统优化']
categories: ['状态空间与序列建模']
summary: '一句话摘要。'
math: true
cover:
  image: 'images/cover-mamba.png'
  alt: '文章封面图'
---
```

如果文章里没有公式，可以删掉 `math: true`。

目前建议使用这些分类：

- `状态空间与序列建模`
- `多模态融合`
- `对比学习与弱配准`
- `协同计算与调度`
- `AI 应用工程`

分类负责导航，标签负责更细的检索。比如一篇文章可以放在 `协同计算与调度`，同时打上 `边缘智能`、`可靠性`、`任务卸载` 等标签。

## 修改文章

直接编辑：

```text
content/posts/*.md
```

修改后先本地预览，确认首页、文章页、分类页都正常。

## 公式写法

行内公式使用：

```text
\(x_i\)
```

块级公式使用：

```text
\[
x_i = y_i + z_i
\]
```

不要在正文里使用单美元符号行内公式，避免 Markdown 把公式误解析。

## 构建检查

发布前运行：

```powershell
.\.tools\hugo\hugo.exe --gc --minify
```

如果没有报错，就可以提交。

## 提交与发布

```powershell
git status
git add .
git commit -m "Update blog content"
git push origin main
```

推送后 GitHub Actions 会自动部署。部署完成后访问：

```text
https://jiulics.github.io/
```

## 常见问题

如果页面公式显示成 `D_i(t)` 这种大标题，说明公式没有被正确保留给 MathJax。检查文章是否使用了 `math: true`，并确认行内公式使用 `\(...\)`、块级公式使用 `\[...\]`。

如果新文章不显示，优先检查：

- `draft` 是否为 `false`
- `date` 是否写到了未来时间
- 文件是否放在 `content/posts/`
- 本地构建是否通过
