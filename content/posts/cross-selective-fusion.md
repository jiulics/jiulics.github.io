---
title: 'Cross-Selective Fusion：用一个模态控制另一个模态的信息流'
date: 2026-05-11T10:20:00+08:00
draft: false
tags: ['Cross-Selective Scan', '红外可见光融合', 'Vision Mamba', '门控融合']
categories: ['多模态融合']
summary: '整理 Cross-Selective Scan 与非对称交叉门控融合的设计直觉：让可见光纹理与红外热目标互相选择，而不是简单拼接。'
math: true
ShowToc: true
TocOpen: true
cover:
  image: 'images/cover-fusion.png'
  alt: '红外可见光多模态融合封面图'
---

很多红外/可见光融合方法最终都会走到一个问题：到底怎么融合？最朴素的方法是拼接或相加：

\[
F_{fus}=\operatorname{Concat}(F^v,F^h)
\]

或者：

\[
F_{fus}=F^v+F^h.
\]

这种做法简单，但它默认两个模态在当前区域同样可靠。现实恰好相反：可见光在白天纹理丰富，在夜晚可能几乎失效；红外能突出热目标，却可能在热交叉场景里产生误导。融合模块如果没有“谁更可信”的判断能力，低质量模态就会污染高质量模态。

Cross-Selective Fusion 的想法是：不要把两路特征机械拼起来，而是让一个模态去控制另一个模态的信息写入。

## 从质量感知开始

设双模态编码器输出：

\[
H_{i,t}^{v}=E_v(x_{i,t}^{v}),\qquad H_{i,t}^{h}=E_h(x_{i,t}^{h}),
\]

其中 \(v\) 表示可见光，\(h\) 表示热红外。为了描述模态质量，可以引入轻量级质量评估头：

\[
q_{i,t}^{m}=\sigma\left((w_q^{m})^\top \operatorname{GAP}(H_{i,t}^{m})\right),\quad m\in\{v,h\}.
\]

\(q^v\) 越高，说明可见光分支当前越可信；\(q^h\) 越高，说明红外分支当前越可信。

为了得到一个主导模态系数，可以写成：

\[
\rho_{i,t}= \frac{\exp(q_{i,t}^{v})} {\exp(q_{i,t}^{v})+\exp(q_{i,t}^{h})}.
\]

当 \(\rho_{i,t}\) 较大时，可见光更应主导交互；当它较小时，红外更应主导交互。

## 非对称交叉门控

先将双模态特征映射到共享语义空间：

\[
\tilde H_{i,t}^{v}=P_v(H_{i,t}^{v}),\qquad \tilde H_{i,t}^{h}=P_h(H_{i,t}^{h}).
\]

然后构造非对称交叉门控：

\[
\bar H_{i,t}^{h} = \tilde H_{i,t}^{h} + \rho_{i,t}\, \sigma\left(W_h[\tilde H_{i,t}^{h}\Vert \tilde H_{i,t}^{v}]\right) \odot \tilde H_{i,t}^{v},
\]

\[
\bar H_{i,t}^{v} = \tilde H_{i,t}^{v} + (1-\rho_{i,t})\, \sigma\left(W_v[\tilde H_{i,t}^{v}\Vert \tilde H_{i,t}^{h}]\right) \odot \tilde H_{i,t}^{h}.
\]

这里的直觉很明确：

- 可见光可靠时，更多地把纹理、边缘和空间结构注入红外表示；
- 红外可靠时，更多地把热目标和暗光鲁棒信息注入可见光表示；
- 低质量模态不是被完全删除，而是被限制为“被校正”而非“主导融合”。

这种非对称性很重要。真实双光融合中，两个模态不是平等竞争关系，而是随环境动态改变主次关系。

## Cross-Selective Scan

上面的交叉门控已经能表达质量感知，但它还没有真正使用 Mamba 最有特点的选择性状态空间机制。Mamba 的选择性更新可以抽象为：

\[
\mathbf h_k=\overline{\mathbf A}_k\mathbf h_{k-1} + \overline{\mathbf B}_k\mathbf x_k,
\]

其中 \(\overline{\mathbf B}_k\) 和 \(\overline{\mathbf C}_k\) 由输入决定。Cross-Selective Scan 的关键是让一种模态生成另一种模态的选择参数。例如：

\[
\overline{\mathbf B}^{h\leftarrow v}_k=s_B(F^v_k),\qquad \overline{\mathbf C}^{h\leftarrow v}_k=s_C(F^v_k),
\]

然后用这些参数处理红外特征：

\[
\mathbf h^h_k = \overline{\mathbf A}^h_k\mathbf h^h_{k-1} + \overline{\mathbf B}^{h\leftarrow v}_k F^h_k.
\]

这意味着可见光不只是“提供一份特征”，而是在告诉红外流：哪些热响应应该写入状态，哪些热背景应该被弱化。反向也成立：

\[
\mathbf h^v_k = \overline{\mathbf A}^v_k\mathbf h^v_{k-1} + \overline{\mathbf B}^{v\leftarrow h}_k F^v_k.
\]

红外可以控制可见光流在暗光或烟雾场景下如何保留目标相关信息。

## 和简单 Attention 的区别

Cross-Attention 通常通过 query-key-value 计算模态间相关性。它表达能力强，但高分辨率 token 下成本较高。Cross-Selective Scan 更像是把“跨模态交互”放进状态更新过程里，沿序列逐步传播信息。

它不是问“所有 token 两两之间相关吗”，而是问“当前 token 应该如何改变状态”。对无人机视频流来说，这种递归状态有一个额外好处：它更容易和后续的协同推理、状态传输结合。

## 一个可实现的模块顺序

一个节点内融合链可以设计为：

1. 双流编码：\(H^v=E_v(x^v), H^h=E_h(x^h)\)；
2. 质量评估：得到 \(q^v,q^h\)；
3. 共享投影：得到 \(\tilde H^v,\tilde H^h\)；
4. 非对称交叉门控：得到 \(\bar H^v,\bar H^h\)；
5. Cross-Selective Scan：进行细粒度长程交互；
6. 语义聚合或检测头输出结果。

在训练中，可以把检测/融合任务损失、对比学习损失和质量正则一起优化：

\[
\mathcal L = \mathcal L_{task} + \lambda_{con}\mathcal L_{con} + \lambda_q\mathcal L_q.
\]

## 小结

Cross-Selective Fusion 的重点不是发明一个更复杂的拼接层，而是让融合过程具备内容相关的“选择权”。可见光提供纹理，红外提供热目标；谁主导，不由人工规则固定，而由输入质量和状态更新共同决定。

这类机制特别适合无人机低空应急场景，因为环境变化太快，固定融合权重几乎一定会在某些时刻失效。
