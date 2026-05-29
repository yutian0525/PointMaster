# PointMaster 慧刷题 — 产品需求文档（PRD V2.0）

## 文档信息

| 项 | 值 |
|---|---|
| 产品名称 | PointMaster 慧刷题 |
| 产品定位 | AI Agent 驱动的自适应知识掌握系统 |
| 文档版本 | V2.0 |
| 基于版本 | V1.2（2026-05-27） |
| 文档日期 | 2026-05-29 |
| 核心变更 | 规则驱动 → Agent 路由决策；练习分块；主观题 LLM 判分；微学习简化；练习详情回顾 |

---

## 1. 产品概述

### 1.1 产品简介

PointMaster 慧刷题是一款 **AI Agent 驱动的自适应知识掌握系统**。

系统通过 AI 解析题库、提取知识点、构建知识图谱，然后以 **分块练习 + Agent 路由决策** 的方式，动态诊断用户掌握状态，智能决定每一步该做什么——继续练习、切换知识点、还是进入微学习。

**核心理念**：动态诊断 → 发现漏洞 → 快速学习 → 强化验证 → 真正掌握

### 1.2 V2.0 核心变化（对比 V1.0）

| 维度 | V1.0 | V2.0 |
|------|------|------|
| 决策方式 | 硬编码规则（阈值触发） | LLM Agent 综合分析后路由 |
| 练习模式 | 快速刷题 / 查缺补漏（用户选） | 统一模式（Agent 自主规划路线） |
| 练习粒度 | 逐题实时决策 | 分块（block）进行，block 结束后决策 |
| 题型 | 选择题 / 判断题 | 选择 / 判断 / 填空 / 简答 / 计算 |
| 判分 | 系统比对答案 | 客观题系统比对 + 主观题 LLM 判分 |
| 微学习 | 一次生成 5 类卡片 | 只生成知识点详解 + 核心概念 |
| 练习记录 | 仅统计数据 | 完整步骤时间线，支持逐题回顾 |
| 用户控制 | 模式选择 + 手动跳过 | Agent 建议 + 用户可覆盖 |

### 1.3 产品定位

PointMaster 不是传统刷题软件，也不是 AI 家教，而是：

**AI Agent 驱动的个性化知识掌握系统**

核心能力：Agent 在每个决策点综合分析「用户现在最需要什么」，并给出可执行的建议。

---

## 2. 目标用户

### 2.1 核心用户群

- **考试备考**：考研、公考、法考、CPA、医考、教资
- **学生群体**：高中、大学、编程学习者

### 2.2 用户特征

- 已拥有题库（自购或机构提供）
- 时间有限，不想盲目刷题
- 希望系统帮助定位薄弱点并快速突破

---

## 3. 系统架构

### 3.1 三层架构

```
┌─────────────────────────────────────────────────────┐
│                  用户交互层                           │
│  练习界面 / 微学习界面 / 详情回顾 / 报告             │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                 Agent 决策层                          │
│  路由决策 / 主观题判分 / 微学习生成 / 划词提问        │
│  （LLM 调用点）                                      │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                算法 + 数据层                          │
│  掌握度计算 / 置信度更新 / 选题 / 持久化存储          │
│  （确定性算法，零延迟）                               │
└─────────────────────────────────────────────────────┘
```

### 3.2 LLM 调用点（共 4 个）

| 调用点 | 触发时机 | 输入 | 输出 |
|--------|----------|------|------|
| **主观题判分** | 每道主观题提交后 | 题目 + 标准答案 + 用户作答 | score (0~1) + 判分理由 |
| **路由决策** | 每个 block 结束后 | 掌握度数据 + block 答题摘要 + 历史趋势 | 下一步建议（JSON） |
| **微学习生成** | 进入微学习时 | 知识点信息 + 用户薄弱表现 | 知识点详解 + 核心概念 |
| **划词提问** | 用户在微学习中选词提问时 | 选中文本 + 上下文 + 用户问题 | AI 解答 |

### 3.3 算法层职责（不用 LLM）

| 职责 | 说明 |
|------|------|
| 掌握度更新 | 每次答题后根据得分实时更新 mastery / confidence |
| 选题 | 根据 Agent 指定的知识点/难度/题型筛选下一 block 的题目 |
| 停止条件判断 | 辅助 Agent 决策的数据输入（连续正确/错误、置信度等） |

---

## 4. 核心模块

### 模块 1：题库导入系统

> 与 V1.0 基本一致，增加题型支持。

**导入流程**：
```
上传文件（Excel / JSON / TXT）
  ↓
系统解析（格式校验 + 题目提取）
  ↓
AI 知识点提取（为每题标注知识点、难度、题型）
  ↓
AI 构建知识图谱（知识点依赖关系、学习顺序）
  ↓
存入结构化题库
```

**支持题型**：

| 题型 | 判分方式 | 实现阶段 |
|------|----------|----------|
| 选择题（单选/多选） | 系统比对 | Phase 1 (MVP) |
| 判断题 | 系统比对 | Phase 1 (MVP) |
| 填空题 | 系统比对 + LLM 辅助（近义表述） | Phase 1 (MVP) |
| 简答题 | LLM 判分 | Phase 2 |
| 计算题 | LLM 判分（步骤 + 结果） | Phase 2 |

**Excel 模板格式**（扩展）：

| 题目 | 题型 | A | B | C | D | 答案 | 解析 | 预期时间(秒) |
|------|------|---|---|---|---|------|------|--------------|

题型字段值：`选择`、`多选`、`判断`、`填空`、`简答`、`计算`

---

### 模块 2：练习系统（Agent 驱动）

#### 2.1 整体流程

```
用户选择题库 → 开始练习（无模式选择）
  ↓
Agent 规划首个 Block
  （决定：题量、知识点范围、难度区间、题型偏好）
  ↓
┌──→ 用户完成当前 Block
│      ↓
│    算法更新掌握度（逐题实时更新）
│      ↓
│    Agent 分析并给出路由建议
│      ↓
│    用户接受或覆盖建议
│      ↓
│    执行决策（下一 Block / 微学习 / 结束）
│      │
└──────┘
```

#### 2.2 Block（练习块）设计

**Block** 是练习的基本粒度单位。一个 Block 包含若干道题，用户连续作答后由 Agent 做一次路由决策。

- Block 大小由 Agent 动态决定（5 / 10 / 20 题）
- Agent 根据以下因素决定 block 大小：
  - 首次练习某知识点：较小 block（5题），快速摸底
  - 巩固阶段：中等 block（10题）
  - 冲刺/强化阶段：较大 block（20题）
- 每个 Block 有明确的目标知识点和难度范围

**Block 内做题流程**：
```
展示题目 → 用户作答 → 即时反馈（对/错 + 解析）→ 下一题
                                                    ↓
                                              Block 完成
```

#### 2.3 Agent 路由决策

每个 Block 完成后，系统将以下数据送给 Agent：

**输入**：
```json
{
  "current_block_summary": {
    "knowledge_points": ["导数", "极值"],
    "total_questions": 5,
    "correct_count": 2,
    "average_time": 35,
    "score_details": [
      { "question_id": 1, "score": 1.0, "time": 20 },
      { "question_id": 2, "score": 0.0, "time": 45 }
    ]
  },
  "mastery_state": {
    "导数": { "mastery": 0.45, "confidence": 0.72, "trend": "declining" },
    "极值": { "mastery": 0.68, "confidence": 0.55, "trend": "stable" }
  },
  "session_history": {
    "blocks_completed": 3,
    "micro_learnings_completed": 1,
    "total_questions_answered": 18,
    "session_duration_minutes": 25
  },
  "available_knowledge_points": ["导数", "极值", "积分", "极限"]
}
```

**输出**（Structured JSON）：
```json
{
  "action": "micro_learning",
  "reason": "你在「导数」知识点连续两个 block 正确率都低于 50%，建议先学习巩固再继续",
  "params": {
    "knowledge_point": "导数",
    "focus_hint": "重点关注求导法则的应用，你多次在链式法则上出错"
  },
  "next_block_preview": {
    "size": 5,
    "knowledge_points": ["导数"],
    "difficulty_range": [0.3, 0.5],
    "note": "微学习后将用较简单的题目验证掌握情况"
  }
}
```

**Agent 可选 actions**：

| action | 含义 | params |
|--------|------|--------|
| `continue_practice` | 继续下一个 Block | `size`, `knowledge_points`, `difficulty_range`, `question_types` |
| `switch_knowledge_point` | 切换到另一个知识点 | `knowledge_point`, `size`, `difficulty_range` |
| `micro_learning` | 进入微学习 | `knowledge_point`, `focus_hint` |
| `finish` | 建议结束本次练习 | `summary`（总结本次收获） |

#### 2.4 用户覆盖机制

Agent 给出建议后，用户界面显示：

```
┌─────────────────────────────────────────────────┐
│  🤖 Agent 建议                                   │
│                                                 │
│  建议进入「导数」微学习                           │
│  原因：连续两个 block 正确率低于 50%              │
│                                                 │
│  [接受建议]   [继续刷题]   [选择其他知识点]       │
└─────────────────────────────────────────────────┘
```

用户可选项：
- **接受建议**：执行 Agent 推荐的 action
- **继续刷题**：忽略建议，继续当前方向的下一个 Block
- **选择其他知识点**：手动指定下一步的知识点
- **进入微学习**（如果 Agent 没建议微学习）：手动触发微学习并选择知识点
- **结束练习**：退出并生成报告

---

### 模块 3：主观题判分系统

#### 3.1 判分层次

```
用户提交答案
  ↓
判断题型
  ├── 客观题（选择/判断）→ 系统直接比对 → score = 0 或 1
  ├── 填空题 → 系统精确比对
  │     └── 不匹配时 → LLM 判断是否近义表述 → score = 0 或 1
  └── 主观题（简答/计算）→ LLM 判分 → score ∈ [0, 1]
        ↓
      score 送入掌握度算法
```

#### 3.2 LLM 判分 Prompt 设计

**输入给 LLM**：
```
你是一位严格的阅卷老师。请对学生的答案进行评分。

【题目】{question_content}
【标准答案】{standard_answer}
【解析】{analysis}
【学生作答】{user_answer}

请输出 JSON：
{
  "score": 0.0~1.0,
  "feedback": "简短评语（1-2句）",
  "correct_parts": "答对的部分",
  "wrong_parts": "答错/缺失的部分"
}

评分标准：
- 1.0：完全正确
- 0.7~0.9：方法正确但有小错误（计算失误、表述不够准确）
- 0.4~0.6：部分正确（思路对但不完整，或关键步骤缺失）
- 0.1~0.3：有相关内容但基本错误
- 0.0：完全错误或未作答
```

#### 3.3 判分结果用于掌握度更新

LLM 输出的 `score` (0~1) 直接作为答题得分送入掌握度算法（见模块 4），与客观题的 0/1 得分统一处理。

---

### 模块 4：掌握度算法

#### 4.1 用户能力模型

每个用户对每个知识点维护：

| 参数 | 范围 | 含义 |
|------|------|------|
| `mastery` | 0~1 | 掌握程度 |
| `confidence` | 0~1 | 系统对评估的置信度 |
| `streak` | 整数 | 连续正确(+)/错误(-)计数 |

#### 4.2 掌握度更新公式

每道题作答后实时更新：

```typescript
// score: 客观题 0/1，主观题 0~1（LLM判分结果）
// difficulty: 题目难度 0~1
// answer_time: 实际用时（秒）
// expected_time: 预期用时（秒）

if (score >= 0.7) {
  // 答对（主观题得分 >= 0.7 视为答对）
  const timeFactor = clamp(1 - answerTime / expectedTime, 0, 1)
  mastery += score * difficulty * 0.1 * (1 + timeFactor * 0.5)
  confidence += 0.15
  streak = streak > 0 ? streak + 1 : 1
} else {
  // 答错
  mastery -= (1 - score) * difficulty * 0.12
  confidence += 0.10
  streak = streak < 0 ? streak - 1 : -1
}

mastery = clamp(mastery, 0, 1)
confidence = clamp(confidence, 0, 1)
```

**变化说明**：相比 V1.0 的 0/1 二元判定，V2.0 引入连续 score，使主观题的部分正确能合理反映到掌握度上。

#### 4.3 数据送入 Agent

算法层计算的掌握度数据作为 Agent 路由决策的输入之一，但 Agent 不修改这些数值。Agent 只读取数据做分析，不写回。

---

### 模块 5：微学习系统（简化版）

#### 5.1 目标

当 Agent 判断用户某知识点薄弱时，进入 2-5 分钟的快速学习，帮助用户理解核心概念后再继续练习。

#### 5.2 生成内容（仅两部分）

进入微学习时，LLM 生成：

| 内容 | 说明 |
|------|------|
| **知识点详细解读** | 完整讲解该知识点，包括定义、原理、适用场景、常见误区 |
| **核心概念** | 提炼关键定义、公式、结论，结构化呈现便于记忆 |

**Prompt 输入**：
```
知识点：{knowledge_point_name}
用户薄弱表现：{focus_hint}（来自 Agent 路由决策的 params）
关联题库的题目示例：{sample_questions}（可选，帮助 LLM 了解考试语境）
```

**输出格式**：
```json
{
  "detailed_explanation": "...(Markdown 格式，支持公式、代码块、列表)",
  "core_concepts": [
    {
      "title": "概念名称",
      "content": "核心定义或结论",
      "formula": "公式（如有）"
    }
  ]
}
```

#### 5.3 界面呈现

```
┌─────────────────────────────────────────────────┐
│  📖 微学习：导数与极值                            │
│                                                 │
│  ── 知识点详解 ──                                │
│                                                 │
│  导数表示函数在某一点的变化率...                   │
│  [用户可选中任意文字提问]                         │
│                                                 │
│  ── 核心概念 ──                                  │
│                                                 │
│  ┌─ 导数定义 ─────────────────────────┐          │
│  │ f'(x) = lim[h→0] (f(x+h)-f(x))/h │          │
│  └────────────────────────────────────┘          │
│                                                 │
│  ┌─ 极值判定 ─────────────────────────┐          │
│  │ f'(x₀)=0 且 f''(x₀)<0 → 极大值    │          │
│  └────────────────────────────────────┘          │
│                                                 │
│  [学完了，继续练习]                               │
└─────────────────────────────────────────────────┘
```

#### 5.4 划词提问

用户可在微学习内容中选中任意文字触发提问：

```
选中文字 → 弹出提问框（预填问题，用户可编辑）
  ↓
LLM 针对选中内容生成解答
  ↓
解答追加显示在当前内容下方
```

- 追问内容与原始微学习内容一起持久化保存
- 回顾微学习时能看到所有追问记录

#### 5.5 微学习完成

用户点击「学完了，继续练习」后：
- 微学习内容完整保存到 session 记录
- Agent 规划下一个 Block（通常是针对刚学习的知识点出验证题）

---

### 模块 6：练习详情与回顾系统（新增）

#### 6.1 目标

一次练习 session 的完整过程被记录为时间线，用户可在之后任意时间回顾每个步骤的详细内容。

#### 6.2 Session 时间线结构

一个 Session 由有序的 Step 组成，每个 Step 是以下类型之一：

| Step 类型 | 包含内容 |
|-----------|----------|
| `practice_block` | Block 内所有题目的完整记录 |
| `agent_decision` | Agent 的建议 + 用户的选择 |
| `micro_learning` | 微学习生成的完整内容 + 划词提问记录 |
| `session_report` | 结束时的掌握度快照和 AI 总结 |

#### 6.3 Practice Block 详情

每个 block 记录：
```json
{
  "step_type": "practice_block",
  "block_index": 1,
  "started_at": "2026-05-29T10:00:00Z",
  "ended_at": "2026-05-29T10:08:00Z",
  "target_knowledge_points": ["导数"],
  "questions": [
    {
      "question_id": 42,
      "question_content": "...",
      "question_type": "选择",
      "user_answer": "B",
      "correct_answer": "C",
      "score": 0,
      "time_spent": 35,
      "analysis": "...",
      "llm_feedback": null
    }
  ],
  "block_stats": {
    "total": 5,
    "correct": 2,
    "average_time": 28,
    "mastery_change": { "导数": { "before": 0.35, "after": 0.42 } }
  }
}
```

#### 6.4 Agent Decision 详情

```json
{
  "step_type": "agent_decision",
  "timestamp": "2026-05-29T10:08:05Z",
  "agent_suggestion": {
    "action": "micro_learning",
    "reason": "连续两个 block 在导数知识点正确率低于 50%",
    "params": { "knowledge_point": "导数", "focus_hint": "链式法则应用" }
  },
  "user_choice": "accepted"
}
```

#### 6.5 Micro Learning 详情

```json
{
  "step_type": "micro_learning",
  "knowledge_point": "导数",
  "started_at": "2026-05-29T10:08:10Z",
  "ended_at": "2026-05-29T10:12:30Z",
  "content": {
    "detailed_explanation": "...(完整 Markdown)",
    "core_concepts": [...]
  },
  "follow_up_questions": [
    {
      "selected_text": "链式法则",
      "user_question": "链式法则怎么用？",
      "ai_answer": "..."
    }
  ]
}
```

#### 6.6 回顾界面

**练习列表页**：展示所有 session，每个显示日期、题库、答题量、时长

**练习详情页**：
```
┌─────────────────────────────────────────────────┐
│  练习记录 — 高等数学题库                          │
│  2026-05-29  共 25 题  用时 32 分钟               │
│                                                 │
│  ── 时间线 ──                                    │
│                                                 │
│  📝 Block 1（5题）  导数  正确率 40%              │
│     → 展开查看逐题详情                           │
│                                                 │
│  🤖 Agent：建议微学习「导数 - 链式法则」          │
│     你的选择：接受                               │
│                                                 │
│  📖 微学习：导数 - 链式法则（4分钟）              │
│     → 点击查看完整内容                           │
│                                                 │
│  📝 Block 2（5题）  导数  正确率 80%              │
│     → 展开查看逐题详情                           │
│                                                 │
│  🤖 Agent：建议切换到「极值」知识点               │
│     你的选择：接受                               │
│                                                 │
│  📝 Block 3（10题）  极值  正确率 70%             │
│     → 展开查看逐题详情                           │
│                                                 │
│  🤖 Agent：建议结束本次练习                       │
│     你的选择：接受                               │
│                                                 │
│  📊 练习报告                                     │
│     → 查看掌握度变化和 AI 总结                    │
└─────────────────────────────────────────────────┘
```

---

### 模块 7：掌握度报告

#### 7.1 触发时机

- 用户主动结束练习
- Agent 建议结束且用户接受

#### 7.2 报告内容

**知识点掌握度概览**：
```
导数        ████████░░  78%  ↑ (+36%)  练习后显著提升
极值        ██████░░░░  62%  ↑ (+12%)  有进步，建议继续
积分        ███░░░░░░░  30%  — (未练习)
```

**本次练习数据**：

| 指标 | 值 |
|------|-----|
| 总答题数 | 25 |
| 总用时 | 32 分钟 |
| 微学习次数 | 1 |
| Block 数 | 3 |
| 涉及知识点 | 导数、极值 |

**AI 学习建议**（Agent 生成）：

> 本次练习在「导数」知识点上进步明显，微学习后正确率从 40% 提升到 80%。建议下次优先练习「极值」和「积分」。极值的判定条件你已基本掌握，但二阶导数判定法还需加强。

---

## 5. 产品页面设计

### 页面 1：首页

- 题库列表（已导入的题库）
- 快速开始练习按钮
- 进行中的练习（可继续）
- 最近练习记录入口

### 页面 2：题库详情

- 题库信息（题目数、知识点数、题型分布）
- 知识点树状列表
- 开始练习按钮

### 页面 3：练习页（做题）

- 题目展示区
  - 选择/判断：选项点击
  - 填空：输入框
  - 简答/计算：富文本输入（支持公式）
- Block 进度指示（如 3/5）
- 即时反馈（答对/错 + 解析 + LLM 评语（主观题））
- 计时器（后台计时，不向用户展示）
- 当前知识点掌握度进度条

### 页面 4：Agent 决策页（Block 间）

- Agent 建议卡片（action + reason）
- 用户选择按钮（接受 / 继续刷题 / 选择知识点 / 微学习 / 结束）
- 当前各知识点掌握度一览

### 页面 5：微学习页

- 知识点详解内容（Markdown 渲染）
- 核心概念卡片列表
- 划词提问交互
- 「学完了，继续练习」按钮

### 页面 6：练习详情/回顾页

- Session 时间线（步骤列表）
- Block 展开：逐题回顾（原题 + 作答 + 正确答案 + 解析）
- 微学习展开：完整内容 + 追问记录
- Agent 决策记录
- 练习报告

### 页面 7：掌握度报告页

- 知识点掌握度柱状图（含变化趋势）
- 学习行为数据
- AI 学习建议
- 「继续学习」/「结束」

---

## 6. 数据库设计

### 6.1 核心表

**question_banks**（题库）：
```
id, name, description, file_type, question_count, knowledge_point_count, created_at, updated_at
```

**questions**（题目）：
```
id, bank_id, content, question_type, options(JSON), answer, analysis, difficulty, expected_time, created_at
```

题型枚举：`choice`、`multi_choice`、`true_false`、`fill_blank`、`short_answer`、`calculation`

**knowledge_points**（知识点）：
```
id, bank_id, name, description, parent_id, prerequisite_ids(JSON), order_index, created_at
```

**question_knowledge**（题目-知识点关联）：
```
id, question_id, knowledge_point_id, is_primary
```

**user_mastery**（用户掌握度）：
```
id, bank_id, knowledge_point_id, mastery, confidence, streak, tested_count, correct_count, last_updated
```

### 6.2 练习记录表（新增/重设计）

**practice_sessions**（练习会话）：
```
id, bank_id, status(active/completed/paused), started_at, ended_at, total_questions, total_blocks, total_micro_learnings, created_at
```

**session_steps**（会话步骤 — 时间线核心表）：
```
id, session_id, step_index, step_type(practice_block/agent_decision/micro_learning/session_report), started_at, ended_at, data(JSON), created_at
```

**answer_records**（答题记录）：
```
id, session_id, step_id, question_id, user_answer, score, time_spent, llm_feedback(JSON), created_at
```

### 6.3 step_type 对应的 data 字段结构

**practice_block**：
```json
{
  "block_index": 1,
  "target_knowledge_points": ["导数"],
  "block_size": 5,
  "difficulty_range": [0.3, 0.7],
  "stats": { "correct": 3, "total": 5, "avg_time": 28 },
  "mastery_snapshot": { "导数": { "before": 0.4, "after": 0.55 } }
}
```

**agent_decision**：
```json
{
  "agent_suggestion": { "action": "micro_learning", "reason": "...", "params": {...} },
  "user_choice": "accepted",
  "user_override": null
}
```

**micro_learning**：
```json
{
  "knowledge_point_id": 3,
  "knowledge_point_name": "导数",
  "focus_hint": "链式法则应用",
  "content": { "detailed_explanation": "...", "core_concepts": [...] },
  "follow_up_questions": [{ "selected_text": "...", "question": "...", "answer": "..." }]
}
```

**session_report**：
```json
{
  "mastery_changes": { "导数": { "start": 0.2, "end": 0.78 } },
  "stats": { "total_questions": 25, "duration_minutes": 32 },
  "ai_summary": "..."
}
```

---

## 7. 技术架构

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + React 19 + TypeScript 5 |
| 样式 | Tailwind CSS v3 + shadcn/ui |
| 数据库 | SQLite via better-sqlite3 + Drizzle ORM |
| 状态管理 | Zustand |
| AI 接入 | OpenAI SDK（统一抽象，支持 OpenAI / DeepSeek / Qwen） |
| 文件解析 | ExcelJS + PapaParse |
| 数据验证 | Zod |

### 7.1 AI 服务配置

```env
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

### 7.2 API 设计概览

| API | 方法 | 说明 |
|-----|------|------|
| `/api/banks` | POST | 上传题库 |
| `/api/banks/[id]` | GET | 题库详情 |
| `/api/sessions` | POST | 创建练习 session |
| `/api/sessions/[id]` | GET | 获取 session 详情（含时间线） |
| `/api/sessions/[id]/next-block` | POST | Agent 规划下一个 block |
| `/api/sessions/[id]/submit-answer` | POST | 提交单题答案 |
| `/api/sessions/[id]/complete-block` | POST | 完成当前 block，触发 Agent 决策 |
| `/api/sessions/[id]/accept-decision` | POST | 用户接受/覆盖 Agent 建议 |
| `/api/sessions/[id]/micro-learning` | POST | 生成微学习内容 |
| `/api/sessions/[id]/micro-learning/ask` | POST | 划词提问 |
| `/api/sessions/[id]/finish` | POST | 结束练习，生成报告 |
| `/api/mastery/[bankId]` | GET | 获取题库掌握度概览 |

---

## 8. 实现分期

### Phase 1（MVP）

- 题库导入（Excel / JSON / TXT）
- AI 知识点提取与分类
- 选择题 + 判断题 + 填空题
- 分块练习 + Agent 路由决策
- 掌握度算法（实时更新）
- 微学习（知识点详解 + 核心概念 + 划词提问）
- 练习详情回顾（时间线 + 逐题回放）
- 掌握度报告

### Phase 2

- 简答题 + 计算题（LLM 判分）
- 富文本答题输入（公式支持）
- 更精细的 Agent Prompt 调优
- 遗忘曲线 + 复习提醒

### Phase 3（远期）

- 知识图谱可视化
- AI 学习路径规划
- AI 错题模式分析
- 多端同步

---

## 9. 核心产品指标

| 指标 | 目标 |
|------|------|
| 用户完成「诊断→学习→验证」完整循环率 | > 60% |
| 微学习后正确率提升 | > 20% |
| 用户对 Agent 建议的接受率 | > 70% |
| 用户「系统理解我的问题」满意度 | > 4.0/5.0 |
| 相比传统方式减少练习量感知 | > 30% |

---

## 10. 设计规范

| 项 | 值 |
|----|-----|
| 主题色 | `#9fb997`（主绿） |
| 辅助色 | `#c8d4c0`（浅绿） |
| 背景色 | `#f4f2f0` |
| 标题字体 | Fraunces |
| 正文字体 | Plus Jakarta Sans |

详见 `docs/design/index.html`

---

## 附录 A：Agent Prompt 模板（路由决策）

```
你是 PointMaster 学习助手。根据以下学习数据，决定用户下一步应该做什么。

## 当前状态
{mastery_state_json}

## 本次 Block 表现
{block_summary_json}

## Session 历史
{session_history_json}

## 可用知识点
{available_knowledge_points}

## 你的决策选项
1. continue_practice：继续练习（可调整难度、题型、block大小）
2. switch_knowledge_point：切换到另一个知识点
3. micro_learning：进入微学习（需指定知识点和学习重点提示）
4. finish：建议结束本次练习

## 决策原则
- 如果某知识点 mastery < 0.4 且 confidence > 0.6，优先建议微学习
- 如果某知识点 mastery > 0.8 且 confidence > 0.7，建议切换到下一个知识点
- 如果用户已连续练习超过 30 分钟或 30 题，考虑建议休息/结束
- block 大小建议：摸底阶段 5 题，巩固阶段 10 题，冲刺阶段 20 题
- 微学习后的下一个 block 应针对刚学习的知识点，难度适当降低

请输出 JSON：
{
  "action": "...",
  "reason": "用一句话向用户解释为什么这么建议",
  "params": { ... },
  "next_block_preview": { "size": N, "knowledge_points": [...], "difficulty_range": [min, max] }
}
```
