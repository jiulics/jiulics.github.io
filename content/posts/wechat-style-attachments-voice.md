---
title: '微信式附件与语音输入复现'
date: 2026-05-18T09:40:00+08:00
draft: false
tags: ['微信小程序', '附件上传', '语音输入', '云存储', 'AI 聊天']
categories: ['AI 应用工程']
summary: '复现聊天页底部 + 附件面板、长按录音、文本附件解析和语音转文字链路。'
ShowToc: true
TocOpen: true
mermaid: true
cover:
  image: 'images/cover-wechat-attachments-voice.svg'
  alt: '微信式附件与语音输入封面图'
---

_复现聊天页底部 `+` 附件面板、长按录音、文本附件解析和语音转文字链路。_

---

## 🎛️ 输入栏设计

聊天页底部采用接近微信的输入结构：

| 区域 | 功能 |
| --- | --- |
| 语音按钮 | 切换文本输入和“按住说话” |
| 输入框 | 普通文本输入 |
| `+` 按钮 | 展开附件面板 |
| 发送按钮 | 发送文本、附件或图片 prompt |
| 附件面板 | 图片、拍照、聊天文件 |

图片模式下，发送按钮用于生成图片；文本模式下，附件文本会被追加到 prompt 上下文。

## 📎 附件数据结构

每个附件统一保存为：

```json
{
  "id": "attachment id",
  "type": "image | file | audio",
  "name": "file name",
  "size": 1234,
  "fileId": "cloud file id",
  "cloudPath": "attachments/<openid>/file",
  "mimeType": "text/plain",
  "duration": 0,
  "text": "extracted text",
  "status": "ready",
  "error": ""
}
```

这个结构同时用于：

- 当前输入栏的待发送附件
- 用户消息气泡展示
- 云端历史持久化
- 删除历史时回收云存储文件

## 🔄 上传与解析流程

```mermaid
sequenceDiagram
    accTitle: Attachment Upload Flow
    accDescr: Shows how image, camera, and file attachments are selected, uploaded to cloud storage, optionally parsed, and finally saved with the conversation.

    participant user as 用户
    participant page as chat 页面
    participant storage as 云存储
    participant proxy as xiaozhiProxy
    participant model as 聊天模型
    participant db as conversations

    user->>page: 点击加号选择附件
    page->>storage: wx.cloud.uploadFile
    storage-->>page: fileId
    page->>proxy: extractAttachmentText(fileId)
    proxy->>proxy: 校验 fileId 归属
    proxy-->>page: text 或不可读原因
    user->>page: 点击发送
    page->>model: 文本 + 可读附件摘要
    page->>db: 保存消息和 attachments
```

文本附件支持优先级：

| 类型 | 行为 |
| --- | --- |
| `.txt`、`.md`、`.json`、`.csv`、`.log` | 云函数读取、截断、加入上下文 |
| 图片 | 展示和预览，不做视觉理解 |
| PDF、Word、Excel | 第一版只保存附件卡片，不解析 |
| 二进制或超大文件 | 返回不可读状态，不阻塞聊天 |

## 🎙️ 语音输入流程

语音输入由 `wx.getRecorderManager` 驱动：

1. 点击语音按钮切换到语音模式。
2. 长按“按住说话”开始录音。
3. 上滑可取消。
4. 松手后得到临时音频文件。
5. 上传到云存储。
6. 调用 `transcribeAudio`。
7. 转写成功后生成用户消息：语音附件 + 转写文本。
8. 按普通文本消息调用聊天模型。

## 🧩 云函数接口

附件和语音相关 action：

| action | 输入 | 输出 |
| --- | --- | --- |
| `extractAttachmentText` | `fileId`、`name`、`mimeType` | `readable`、`text`、`reason` |
| `transcribeAudio` | `fileId`、`name`、`mimeType` | `text` |
| `saveConversation` | `conversation` | 保存后的会话 |
| `deleteConversation` | `id` | 删除状态，并清理附件 |
| `clearConversations` | 无 | 清空当前用户历史，并清理附件 |

所有接口都必须由云函数读取 `OPENID`，并检查附件是否属于当前用户。

## ✅ 验收清单

运行检查：

```powershell
node --check pages/chat/chat.js
node --check cloudfunctions/xiaozhiProxy/index.js
node cloudfunctions/xiaozhiProxy/test.js
```

手动验收：

- 点击 `+` 后附件面板展开，再次点击收起
- 选择图片后显示图片附件卡片，可预览
- 拍照后图片上传并进入待发送列表
- 选择 `.md` 文件后显示解析成功状态
- 发送含文本附件的消息，模型能参考附件内容回答
- 长按录音松开后，语音转写文本进入聊天
- 转写失败时显示可读错误，不丢失语音附件
- 换用户后看不到前一个用户的附件历史
