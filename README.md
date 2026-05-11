# jiulics

本地源码保存在当前目录，使用 Hugo 和 PaperMod 主题构建，并通过 GitHub Actions 部署到 GitHub Pages。

## 本地预览

```powershell
.\.tools\hugo\hugo.exe server -D
```

打开 Hugo 输出的本地地址，通常是 `http://localhost:1313/`。

## 新建文章

```powershell
.\.tools\hugo\hugo.exe new content posts/my-post.md
```

把文章头部的 `draft` 改成 `false` 后，推送到 GitHub 即可发布。

## 部署到 GitHub Pages

1. 在 GitHub 新建或打开 `jiulics.github.io` 仓库。
2. 把本地仓库推送到 GitHub 的 `main` 分支。
3. 进入仓库 `Settings -> Pages`。
4. 将 `Build and deployment` 的 `Source` 设为 `GitHub Actions`。
5. 推送后等待 `Deploy Hugo site to GitHub Pages` 工作流完成。

当前配置按个人站点仓库处理，访问地址为 `https://jiulics.github.io/`。

如果改用普通项目仓库，比如 `blog`，访问地址通常是 `https://jiulics.github.io/blog/`，同时需要把 `hugo.toml` 里的 `baseURL` 改成这个地址。
