# jiulics

Hugo + PaperMod 搭建的研究型博客，源码在当前目录，线上地址：

```text
https://jiulics.github.io/
```

站内维护手册：`https://jiulics.github.io/guide/blog-publishing/`

## 本地预览

```powershell
.\.tools\hugo\hugo.exe server -D
```

通常打开：

```text
http://localhost:1313/
```

## 新建文章

```powershell
.\.tools\hugo\hugo.exe new content posts/my-post.md
```

正式发布时，front matter 至少包含：

```yaml
---
title: '文章标题'
date: 2026-05-11T12:00:00+08:00
draft: false
tags: ['Mamba', '无人机']
categories: ['Mamba 与视觉状态空间']
summary: '一句话摘要。'
math: true
cover:
  image: 'images/cover-mamba.png'
  alt: '文章封面图'
---
```

没有公式时可以删掉 `math: true`。

## 修改文章

直接编辑：

```text
content/posts/*.md
```

改完先本地预览，再构建检查：

```powershell
.\.tools\hugo\hugo.exe --gc --minify
```

## 发布

```powershell
git status
git add .
git commit -m "Update blog content"
git push origin main
```

GitHub Actions 会自动部署到 GitHub Pages。

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

不要用单美元符号写行内公式，避免 Markdown 误解析。
