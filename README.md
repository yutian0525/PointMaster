<div align="center">

# PointMaster 慧刷题

**AI 知识图谱驱动的自适应刷题系统**

少刷题，更快掌握 —— 先诊断你的知识漏洞，再把力气只花在薄弱处。

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![Status](https://img.shields.io/badge/status-开发中-9fb997)](#路线图)

[宣传页](web/index.html) · [产品需求（PRD）](docs/PRD) · [设计原型](docs/design)

</div>

---

## 这是什么

传统刷题是「不断重复直到记住」——会的反复做，不会的照样漏。**PointMaster 慧刷题** 换一条路：

> 先诊断 → 发现漏洞 → 快速学习 → 少量强化 → **真正掌握**

选完题库后，AI 分析知识图谱并生成一条「知识点刷题顺序」（前置在前、进阶在后）。你沿这条路径逐个知识点推进，每个知识点做完后自主决定重刷、错题重刷或进入下一站。系统在右侧实时呈现算法驱动的掌握度分析，让你随时知道自己「掌握到什么程度」。

**核心理念**：清晰的学习路径 + 用户掌控节奏 + 算法实时反馈。

## 核心特性

| 特性 | 说明 |
|------|------|
| **题库一键导入** | 支持 Excel / JSON / TXT，直接搬入已有题库，无需重录 |
| **AI 知识点提取** | 自动识别每题的知识点、标注前置依赖，在后台构建知识图谱 |
| **知识点刷题路径** | AI 一次性规划有依赖顺序的路径，支持自定义提示词与拖拽微调 |
| **自适应掌握度** | 含时间因子的实时算法，逐题更新 `mastery` / `confidence` / `streak` |
| **单页三区刷题** | 知识点条 / 做题区 / 掌握度面板，一屏尽览 |
| **单题问 AI** | 就当前题目划词追问，AI 解答随答题记录持久化 |
| **微学习卡片** | 薄弱知识点生成讲解卡片（保留能力，V3.0 不在主线强制） |
| **掌握度报告** | 各知识点掌握度变化、正确率、用时与薄弱清单 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) + React 19 + TypeScript 5 |
| 样式 | Tailwind CSS v3 + shadcn/ui |
| 数据库 | SQLite（better-sqlite3）+ Drizzle ORM |
| 状态管理 | Zustand |
| 图谱可视化 | React Flow（`@xyflow/react`） |
| 拖拽交互 | @dnd-kit/core |
| AI 接入 | OpenAI SDK（统一抽象，OpenAI / DeepSeek / Qwen 可切换） |
| 文件解析 | ExcelJS（Excel）+ PapaParse（CSV/TXT） |
| 数据校验 | Zod |
| 测试 | Vitest |

> 数据库采用 better-sqlite3 同步 API，所有 DB 操作在服务端执行，适合自托管 / SSR，不适合无服务器部署。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（见下方「环境变量」）
cp .env.example .env.local   # 若无示例文件，手动创建 .env.local

# 3. 初始化数据库（执行迁移）
npx drizzle-kit migrate

# 4. 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可访问。

### 常用命令

```bash
npm run dev      # 开发模式
npm run build    # 生产构建
npm run start    # 启动生产服务
npm run lint     # 代码检查
npm run test     # 运行 Vitest 测试

npx drizzle-kit generate   # 根据 schema 生成迁移文件
npx drizzle-kit migrate    # 执行迁移
npx drizzle-kit studio     # 可视化查看数据库
```

## 环境变量

在项目根目录创建 `.env.local`：

```env
LLM_PROVIDER=deepseek                    # openai | deepseek | qwen
LLM_API_KEY=sk-xxxxxxxxxxxxxxxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

AI 仅负责**非实时**环节：知识点提取与标注、知识图谱构建、知识点排序规划、微学习内容生成、单题问 AI。刷题过程中的选题、判分、掌握度更新、完成判定均由**确定性算法**完成，不依赖 LLM，保证做题零延迟（提交到反馈 < 200ms）。

## 掌握度算法

每个用户对每个知识点维护三个参数：`mastery`（掌握程度 0~1）、`confidence`（评估置信度 0~1）、`streak`（连续正确 + / 错误 - 计数）。每答一题实时更新：

```typescript
// score: 客观题 0 或 1；difficulty: 难度 0~1；answerTime / expectedTime: 秒
if (score >= 1) {
  // 答对：越快越对，涨得越多
  const timeFactor = clamp(1 - answerTime / expectedTime, 0, 1)
  mastery    += difficulty * 0.1 * (1 + timeFactor * 0.5)
  confidence += 0.15
  streak = streak > 0 ? streak + 1 : 1
} else {
  // 答错：按难度扣分，置信度仍上升
  mastery    -= difficulty * 0.12
  confidence += 0.10
  streak = streak < 0 ? streak - 1 : -1
}
mastery = clamp(mastery, 0, 1)
confidence = clamp(confidence, 0, 1)
```

- **微学习触发**：`confidence > 0.6 && mastery < 0.7`（懂一点但没吃透）
- **知识点完成**：`mastery ≥ 0.8 && confidence ≥ 0.7`，或题目全部做完（先到为准）

## 目录结构

```
pointmaster/
├── app/                    # Next.js App Router（页面 + API Route Handlers）
│   ├── api/                # banks / questions / sessions / mastery / ai
│   ├── banks/              # 题库管理与详情
│   └── practice/           # 刷题、微学习、报告页
├── components/             # 可复用组件（ui / knowledge-graph / practice / report ...）
├── lib/
│   ├── db/                 # Drizzle schema、连接、migrations
│   ├── ai/                 # LLM 抽象层（提取知识点 / 建图 / 排序 / 生成微学习）
│   ├── algorithm/          # 自适应算法（掌握度 / 选题 / 推荐）
│   └── parsers/            # 文件解析（excel / json / txt）
├── docs/                   # PRD、设计原型、技术方案
├── web/                    # 产品宣传页（独立静态 index.html）
└── data/                   # SQLite 数据库文件（开发环境 pointmaster.db）
```

## 宣传页

`web/index.html` 是一个**零依赖、单文件**的产品宣传页，使用 [MiSans](https://hyperos.mi.com/font) 字体（CDN 加载），直接用浏览器打开即可预览。

## 路线图

- **V3.0（当前）**：用户主导、按知识点顺序线性刷题闭环；单页三区；仅客观题；算法实时掌握度；单题问 AI；掌握度报告。
- **后续迭代**：主观题 LLM 判分、微学习整合进刷题闭环、AI 报告总结与学习建议、遗忘曲线与复习提醒。
- **远期**：Agent 自主分块路由（高级模式）、知识图谱可视化前端、多端同步。

详见 [`docs/PRD/`](docs/PRD)。

## 许可证

暂未指定开源许可证。如需使用或分发，请先在仓库提 issue 与作者确认。

---

<div align="center">
<sub>PointMaster 慧刷题 · 把你的题库变成一条通往掌握的路</sub>
</div>


