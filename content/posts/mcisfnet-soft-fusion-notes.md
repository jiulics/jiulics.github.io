---
title: 'MCISFNet 笔记：为什么要先补充，再交互'
date: 2026-05-11T20:10:00+08:00
draft: false
tags: ['MCISFNet', 'RGB-IR', 'YOLOv8', '软融合']
categories: ['多模态融合']
summary: '用 MCISFNet 解析 RGB-Infrared 航空目标检测中的先补充后交互：显著性软融合先补齐模态缺口，多尺度门控再校准空间特征。'
math: true
ShowToc: true
TocOpen: true
cover:
  image: 'images/cover-soft-fusion.png'
  alt: '显著性软融合研究封面图'
---

多模态融合里有一个常被低估的问题：特征交互并不总是越早越好。如果某个模态已经因为暗光、烟雾、热交叉或运动模糊变得不完整，直接把它拿去和另一模态交互，噪声会沿着网络跨层传播。后面再加注意力，也只是把污染后的特征重新加权。

MCISFNet 给出的思路很值得整理：先做模态间的信息补充，再做细粒度交互。换句话说，它不是一上来就问“两个模态怎么互相注意”，而是先问“这个模态缺了什么，另一个模态能不能补一点”。

## 信息流

MCISFNet 面向 RGB-Infrared 航空图像目标检测，主干可以理解为 YOLOv8 的双分支变体。RGB 和 IR 分别编码，随后经过两个关键步骤：

\[
X_{rgb}^{\prime} = X_{rgb} + SMSFM(X_{rgb}, X_{ir})
\]

\[
X_{ir}^{\prime} = X_{ir} + SMSFM(X_{rgb}, X_{ir})
\]

\[
X_{rgb}^{\prime\prime} = MIGM_{rgb}(X_{rgb}^{\prime}, X_{ir})
\]

\[
X_{ir}^{\prime\prime} = MIGM_{ir}(X_{ir}^{\prime}, X_{rgb})
\]

这里的 SMSFM 负责显著性引导的软补充，MIGM 负责多尺度交互门控。这个顺序很关键：先减少模态缺失带来的空洞，再让两个模态进行更细的空间交互。

## SMSFM：显著性软补充

SMSFM 先对两个模态分别生成显著性掩码：

\[
M_{rgb}=\sigma(f_{rgb}(X_{rgb}))\in[0,1]^{1\times H\times W}
\]

\[
M_{ir}=\sigma(f_{ir}(X_{ir}))\in[0,1]^{1\times H\times W}
\]

掩码不是简单告诉模型“用 RGB”或“用 IR”，而是给每个区域一个软权重。随后使用互补区域进行补充：

\[
\bar X_{rgb}=X_{rgb}\odot M_{rgb}+X_{ir}\odot(1-M_{ir})
\]

\[
\bar X_{ir}=X_{ir}\odot M_{ir}+X_{rgb}\odot(1-M_{rgb})
\]

这个公式背后的直觉很朴素：如果 RGB 的某片区域显著，保留 RGB；如果 IR 的某片区域不显著，那么它的缺口可以从 RGB 的互补区域里找一点信息。反过来也一样。

最后再把两个补充后的特征拼接，通过空间注意力得到融合特征：

\[
X_{fusion}=F_{fusion}(\operatorname{Concat}(\bar X_{rgb},\bar X_{ir}))
\]

我喜欢这个模块的原因是它没有把融合做成二选一。无人机图像里很少存在“某个模态完全正确、另一个完全错误”的干净情况，大多数时候是局部区域可靠性在变化。软补充比硬选择更符合这种现实。

## MIGM：多尺度交互门控

有了全局补充后，MIGM 再做局部交互。以 RGB 为主模态为例，先拼接主辅特征：

\[
X_{cat}=\operatorname{Concat}(X_{rgb}^{\prime},X_{ir})\in\mathbb R^{2C\times H\times W}
\]

然后下采样扩大感受野，再上采样恢复分辨率：

\[
X_{down}=f_{down}(X_{cat})\in\mathbb R^{C\times H/2\times W/2}
\]

\[
X_{up}=f_{up}(X_{down})\in\mathbb R^{C\times H\times W}
\]

门控信号由原特征和多尺度上下文共同产生：

\[
G=\sigma(\operatorname{Conv}_{3\times3}(X_{comb}))\in[0,1]^{C\times H\times W}
\]

\[
X_{rgb}^{\prime\prime}=X_{rgb}^{\prime}\odot G
\]

这一步更像“校准”而不是简单融合。它让辅助模态参与决定主模态哪些位置应该增强、哪些位置应该抑制。对航空图像来说，这尤其有用，因为小目标很容易被复杂背景吞掉，多尺度上下文能帮助模型区分目标热响应和背景噪声。

## 深层上下文：先融合，后池化

在网络最深层，特征分辨率低但语义抽象强。MCISFNet 没有让两个分支各自独立做 SPPF，而是先融合再池化：

\[
X_{out}=SPPF(X_{rgb}^{\prime\prime}+X_{ir}^{\prime\prime})
\]

这一步减少了深层上下文的冗余，也让最终语义更早进入共享空间。对检测任务来说，深层 SPPF 不是为了保留模态差异，而是为了形成对目标位置和类别更稳定的联合理解。

## 和 UAVFusion-Mamba 的关系

MCISFNet 的“先补充、后交互”可以给 UAVFusion-Mamba 一个很直接的启发：节点内融合不应该只设计一个跨模态交互块，还应该明确区分两类动作。

第一类是补缺：当某个模态局部区域失效时，用另一模态的互补信息补齐。第二类是交互：在补缺之后，再用 Mamba 或门控机制建模长程依赖与细粒度互补。

如果用 UAVFusion-Mamba 的语言表达，这对应：

\[
\text{Saliency Compensation}\rightarrow\text{Cross-Selective Interaction}\rightarrow\text{Semantic Aggregation}
\]

这样拆分之后，每个模块的物理含义更清楚，也更适合后续做协同卸载。补缺模块可以尽量放在本地，避免把不完整的原始特征直接传出去；交互和聚合模块则可以根据算力、链路和时延决定是否卸载。

## 小结

MCISFNet 最值得借鉴的不是某一个卷积细节，而是它的融合顺序：

1. 用显著性软融合补齐模态缺口；
2. 用多尺度门控做细粒度空间校准；
3. 在深层共享上下文中完成联合语义提取。

放到无人机 RGB-IR 感知里，模态退化往往是局部、动态、连续发生的；融合模块因此不宜做硬选择，而应保留软补充、分阶段交互和质量感知。
