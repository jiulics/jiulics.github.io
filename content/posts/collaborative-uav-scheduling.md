---
title: '多无人机协同推理与卸载调度：从 Mamba 状态到 Lyapunov 优化'
date: 2026-05-11T10:40:00+08:00
draft: false
tags: ['协同计算', '无人机', 'Lyapunov', 'Mamba', '任务卸载']
categories: ['协同计算与调度']
summary: '把多无人机双光感知拆成后缀卸载、时延能耗建模、精度收益代理和质量感知结果融合四个调度环节。'
math: true
ShowToc: true
TocOpen: true
cover:
  image: 'images/cover-scheduling.png'
  alt: '多无人机协同计算调度封面图'
---

无人机低空应急感知不是单机问题。单架 UAV 可能算力不足、电量紧张、视角受遮挡，或者通信链路不稳定。更现实的系统应当允许多个节点协同观测、协同推理，并在必要时把部分计算卸载给算力富余的节点。

如果感知模型采用 Transformer，协同推理常常受限于中间特征或 KV cache 的传输开销。Mamba 的一个系统级优势在于它的状态表示更紧凑：递归推理依赖当前输入和隐状态，隐状态大小与序列长度不直接绑定。这使得“状态接力式”的协同推理更有想象空间。

## 系统定义

设系统中共有 \(N\) 架无人机，节点集合为：

\[
\mathcal U=\{1,2,\dots,N\}.
\]

系统按事件驱动运行。第 \(t\) 次事件的发起节点记为 \(a_t\)。参与协同观测的节点集合为：

\[
\mathcal C_t\subseteq\mathcal U,
\]

可提供空闲算力的辅助节点集合为：

\[
\mathcal H_t\subseteq\mathcal U.
\]

对任意协同节点 \(i\in\mathcal C_t\)，它采集到的双模态输入为：

\[
x_{i,t}^{v},\qquad x_{i,t}^{h}.
\]

其中 \(v\) 表示可见光，\(h\) 表示热红外。

## 节点内处理链

一个节点内的多模态处理链可以拆成：

\[
\text{双模态编码} \rightarrow \text{质量评估} \rightarrow \text{跨模态对齐} \rightarrow \text{Mamba 交互} \rightarrow \text{语义聚合与推理头}.
\]

前缀编码通常必须在采集节点本地执行，因为它直接依赖原始传感器输入。后面的对齐、交互、聚合与任务头可以视为可切分后缀，用于在线卸载。

设后缀模块被划分为 \(L=4\) 个顺序依赖子模块：

\[
\mathcal M= \{ 1:\text{特征对齐}, 2:\text{跨模态交互}, 3:\text{语义聚合}, 4:\text{局部推理头} \}.
\]

对节点 \(i\)，定义切分点为：

\[
s_i(t)\in\{1,\dots,L+1\},
\]

目标执行节点为：

\[
o_i(t)\in\mathcal H_t\cup\{i\}.
\]

若 \(o_i(t)=i\)，表示本地执行；否则表示跨节点卸载。

## 时延模型

定义卸载指示变量：

\[
I_i^{off}(t)=\mathbf 1_{\{o_i(t)\neq i\}}.
\]

当在切分点 \(s_i(t)\) 卸载时，单分支延迟由本地前缀计算、特征传输和远端后缀计算组成：

\[
D_i(t) = \sum_{l=1}^{s_i(t)-1}\frac{C_i^{(l)}}{f_i(t)} + I_i^{off}(t) \left( \frac{S_i^{(s_i(t)-1)}}{R_{i,o_i(t)}(t)} +T_{penalty} + \sum_{l=s_i(t)}^{L} \frac{C_i^{(l)}}{f_{o_i(t)}(t)} \right).
\]

其中 \(C_i^{(l)}\) 是第 \(l\) 个子模块计算周期数，\(S_i^{(l)}\) 是该模块输出特征大小，\(R_{i,j}(t)\) 是节点 \(i\) 到 \(j\) 的无线速率，\(T_{penalty}\) 表示握手冲突或链路建立惩罚。

如果目标执行节点不是发起节点，还需要把结果回传给 \(a_t\)。定义：

\[
I_i^{res}(t)=\mathbf 1_{\{o_i(t)\neq a_t\}}.
\]

事件级端到端时延由最慢分支决定：

\[
D_t = \max_{i\in\mathcal C_t} \left( D_i(t)+I_i^{res}(t)\frac{S_{res}}{R_{o_i(t),a_t}(t)} \right) +D_{a_t}^{dec}(t).
\]

## 能耗模型

节点 \(i\) 的本地处理、特征发送与悬停能耗为：

\[
E_i(t) = \kappa_c\sum_{l=1}^{s_i(t)-1}C_i^{(l)}[f_i(t)]^2 + \mathbf 1_{\{o_i(t)\neq i\}} \frac{P_i^{tx}S_i^{(s_i(t)-1)}}{R_{i,o_i(t)}(t)} + P_i^{fly}D_i(t).
\]

辅助节点接收特征并执行后缀的能耗为：

\[
E_{o_i(t)}^{off}(t) = \frac{P_{o_i(t)}^{rx}S_i^{(s_i(t)-1)}}{R_{i,o_i(t)}(t)} + \kappa_c\sum_{l=s_i(t)}^L C_i^{(l)}[f_{o_i(t)}(t)]^2.
\]

结果回传能耗为：

\[
E_{o_i(t)}^{res}(t) = \mathbf 1_{\{o_i(t)\neq a_t\}} \frac{P_{o_i(t)}^{tx}S_{res}}{R_{o_i(t),a_t}(t)}.
\]

发起节点融合能耗为：

\[
E_{a_t}^{fus}(t) = \sum_{i\in\mathcal C_t} \mathbf 1_{\{o_i(t)\neq a_t\}} \frac{P_{a_t}^{rx}S_{res}}{R_{o_i(t),a_t}(t)} + \kappa_c C_{fus}[f_{a_t}(t)]^2.
\]

总能耗为：

\[
E_t = \sum_{i\in\mathcal C_t} \left[ E_i(t) + \mathbf 1_{\{o_i(t)\neq i\}}E_{o_i(t)}^{off}(t) + E_{o_i(t)}^{res}(t) \right] + E_{a_t}^{fus}(t).
\]

这里一个容易被忽略的事实是：无人机悬停功率 \(P_i^{fly}\) 往往远大于通信和计算功率。因此控制时延不仅是为了实时性，也是在间接控制飞行能耗。

## 精度收益代理

调度必须在高开销后缀计算之前做出决策，不能依赖最终检测结果。因此需要一个只依赖轻量前缀特征的精度收益代理。

可使用三个指标：

\[
\bar q_{i,t}=\frac{q_{i,t}^v+q_{i,t}^h}{2},
\]

\[
\kappa_{i,t}^{enc} = \operatorname{cos}( \operatorname{GAP}(H_{i,t}^v), \operatorname{GAP}(H_{i,t}^h) ),
\]

以及基于物理位置的视角有效性 \(\nu_{i,t}\)。单节点精度收益代理为：

\[
\hat a_i(t) = \alpha_1\bar q_{i,t} + \alpha_2\kappa_{i,t}^{enc} + \alpha_3\nu_{i,t},
\]

其中 \(\sum_k\alpha_k=1\)。

为了避免多架无人机重复观察同一视角，加入空间冗余惩罚：

\[
\hat{\mathcal A}_t = \sum_{i\in\mathcal C_t}z_i(t)\hat a_i(t) - \lambda_r\sum_{i<j}z_i(t)z_j(t)R_{ij}(t).
\]

\(z_i(t)\) 表示节点是否被接纳，\(R_{ij}(t)\) 表示观测冗余度。

## Lyapunov 在线调度

系统需要长期满足平均时延和能耗约束：

\[
\overline D\le D_{max},\qquad \overline E\le E_{max}.
\]

引入虚拟队列：

\[
Z(t+1)=\max\{0,Z(t)+D_t-D_{max}\},
\]

\[
Y(t+1)=\max\{0,Y(t)+E_t-E_{max}\}.
\]

计算节点还有物理任务队列：

\[
Q_j(t+1) = \max\{0,Q_j(t)-f_j^{loc}\Delta t+C_{in}^j(t)\}.
\]

定义 Lyapunov 函数：

\[
\mathcal L(\Theta(t)) = \frac{1}{2} \left( Z^2(t)+Y^2(t)+\sum_jQ_j^2(t) \right).
\]

根据 Drift-plus-Penalty 思路，单时隙调度可以转化为最小化：

\[
\pi_t^* = \arg\min_{\pi_t} \left[ Z(t)D_t + Y(t)E_t + \sum_j Q_j(t)C_{in}^j(t) - V\hat{\mathcal A}_t \right].
\]

\(V\) 控制识别收益与资源拥塞之间的权衡。\(V\) 越大，系统越愿意追求识别效用；\(V\) 越小，系统越保守，更重视队列稳定和资源约束。

## 质量感知结果融合

各节点完成本地或卸载推理后，将预测结果回传给发起节点。最终融合权重不应由通信延迟决定，而应由预测可靠性决定。

设 \(\tilde c_{i,t}\) 是温度校准后的预测置信度，\(\eta_{i,t}\) 是节点级语义质量，\(\kappa_{i,t}\) 是双模态一致性，则：

\[
\omega_{i,t} = \frac{ \exp(\beta_1\tilde c_{i,t}+\beta_2\eta_{i,t}+\beta_3\kappa_{i,t}) }{ \sum_{j\in\mathcal C_t} \exp(\beta_1\tilde c_{j,t}+\beta_2\eta_{j,t}+\beta_3\kappa_{j,t}) }.
\]

最终 logits 为：

\[
l_t^\star = \sum_{i\in\mathcal C_t}\omega_{i,t}l_{i,t}, \qquad p_t^\star=\operatorname{softmax}(l_t^\star).
\]

这样做的好处是，底层通信与计算耗时不会直接污染感知判断。慢节点不一定错，快节点也不一定准；最终融合应该回答的是“谁的预测更可靠”。

## 小结

多无人机协同推理的核心不是简单把任务丢给别人算，而是在时延、能耗、带宽和识别收益之间做在线权衡。Mamba 在这里提供了两层价值：

1. 模型层：线性复杂度和选择性机制适合高分辨率双光感知；
2. 系统层：紧凑状态和可切分后缀让低带宽协同推理更可行。

如果把节点内融合和节点间调度放在一起看，UAVFusion-Mamba 更像是一个“感知-通信-计算”联合设计问题，而不是单纯的网络结构改进。
