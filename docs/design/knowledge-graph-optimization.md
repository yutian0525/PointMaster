# 知识图谱构建优化方案对比

**日期**：2026-05-28
**背景**：当前纯 LLM 方案对 260 题题库需要 27 次 API 调用（1 次建图 + 26 次逐题分类），成本高、速度慢，且受 context window 限制。

---

## 当前痛点

1. 大题库全部题目送 LLM 建图有 context 上限问题
2. 逐题分类需要 N 次 API 调用（260 题 = 26 批，约 3-5 分钟）
3. 知识点粒度依赖 prompt 调优，不够稳定

---

## 方案对比

| | 当前方案（纯 LLM） | 方案 A（纯聚类） | 混合方案（推荐） |
|---|---|---|---|
| 建图 | LLM 看全部题目 | 聚类 + LLM 命名 | 聚类 + LLM 命名 |
| 分类 | LLM 逐题归类 | 硬聚类（1对1） | 相似度打分（1对多） |
| 多知识点 | 支持 | 不支持 | 支持 |
| API 调用 | N+1 次 | 1-2 次 | 1-2 次 |
| 大题库 | 受 context 限制 | 无限制 | 无限制 |
| 准确率 | 高（但贵） | 中等 | 接近 LLM 水平 |

---

## 推荐：混合方案（Embedding + 聚类 + LLM 命名）

### Phase 1: Embedding + 聚类 → 确定知识图谱结构

```
所有题目 → Embedding 向量化 → 聚类(HDBSCAN/K-Means)
  → 每个 cluster 取代表题（离质心最近的 3-5 题）
  → LLM 给 cluster 命名 + 描述 + 建依赖关系
```

- 知识点数量由数据自然聚集决定，不会太宽泛或太细碎
- 只需 1 次 embedding 批量调用 + 1 次 LLM 调用
- 题库规模不再受 context window 限制

### Phase 2: 向量相似度 → 多标签分配

```typescript
// 不是硬聚类，而是对每题算与所有知识点的相似度
for (const question of allQuestions) {
  const qVec = embed(question.content);
  const scores = knowledgePoints.map(kp => ({
    name: kp.name,
    score: cosineSimilarity(qVec, kp.centroidVec)  // cluster 质心向量
  }));

  scores.sort((a, b) => b.score - a.score);

  // 主知识点: top 1
  // 次要知识点: score > 0.75 * topScore 的其他点（最多取 3 个）
  const primary = scores[0];
  const secondary = scores.slice(1).filter(s => s.score > primary.score * 0.75);
}
```

---

## 分类准确率预估

| 场景 | 误分率 | 原因 |
|------|--------|------|
| 主题差异大（职业道德 vs MySQL 语法） | <3% | embedding 空间天然分离 |
| 主题相近（ADO.NET DataReader vs DataAdapter） | 10-20% | 向量距离接近，边界模糊 |
| 综合题（涉及多个知识点） | ~30% 被归到单一类 | 硬聚类限制（混合方案用相似度解决） |

NCRE 题库跨度大（职业道德、硬件、网络、C#、MySQL、Java、HTML/CSS、软件工程），大类之间分离度很高，粗分准确率 90%+。

---

## Embedding 模型选择

| 选项 | 优势 | 劣势 |
|------|------|------|
| DeepSeek embedding API | 与现有 API 统一 | 需确认是否支持 |
| 阿里通义 text-embedding-v3 | 中文效果好，1536 维 | 额外接口 |
| BGE-M3（本地） | 免费，无网络依赖 | 需要 Python 环境或 ONNX |
| OpenAI text-embedding-3-small | 成熟稳定 | 海外 API，延迟高 |

---

## 实现优先级

1. **短期**（当前）：纯 LLM 方案已可用，适合小题库（<100 题）
2. **中期优化**：接入 embedding API，用混合方案替代逐题分类（省成本、提速）
3. **长期**：支持增量更新（新题只需 embedding + 相似度计算，无需重建图谱）

---

## 增量更新设计（未来）

```
新题导入 → Embedding → 与现有知识点质心计算相似度
  → 如果 max similarity > 阈值 → 归入现有知识点
  → 如果 max similarity < 阈值 → 可能是新知识点，触发局部重聚类
```

这使得题库可以持续扩充，而不需要每次全量重建知识图谱。
