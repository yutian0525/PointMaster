"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { OrderedKnowledgePoint, PlanPreviewResponse } from "@/lib/practice/types";

export interface PlanBankOption {
  id: string;
  name: string;
  totalQuestions: number;
  knowledgePointCount: number;
  createdAt: number;
}

const PROMPT_CHIPS = ["优先刷高频考点", "从最薄弱的开始", "先易后难"];

export function PlanClient({
  banks,
  initialBankId,
}: {
  banks: PlanBankOption[];
  initialBankId: string | null;
}) {
  const router = useRouter();
  const [bankId, setBankId] = useState<string | null>(initialBankId);
  const [showPicker, setShowPicker] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<PlanPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const bank = banks.find((b) => b.id === bankId) ?? null;

  async function generateOrder() {
    if (!bankId) return;
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch("/api/plan-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bankId, customPrompt: prompt.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "生成失败");
        return;
      }
      setPlan(data as PlanPreviewResponse);
    } catch {
      setError("网络异常，请重试");
    } finally {
      setPlanning(false);
    }
  }

  async function startPractice() {
    if (!bankId || !plan) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bankId,
          customPrompt: prompt.trim() || undefined,
          orderedKnowledgePoints: plan.orderedKnowledgePoints,
          planningNote: plan.planningNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "创建 session 失败");
        return;
      }
      router.push(`/practice/${data.sessionId}/quiz`);
    } catch {
      setError("网络异常，请重试");
      setCreating(false);
    }
  }

  if (banks.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-10 text-center">
        <div className="font-display text-[24px] font-semibold mb-2">暂无可用题库</div>
        <div className="text-text-muted text-[13.5px] mb-5">
          请先在「题库管理」上传题库并等待 AI 处理完成。
        </div>
        <Link
          href="/banks"
          className="px-5 py-2.5 rounded-md text-[13px] font-bold bg-primary-dark text-white shadow-md"
        >
          去题库管理
        </Link>
      </div>
    );
  }

  const totalQuestions = plan
    ? plan.orderedKnowledgePoints.reduce((sum, k) => sum + (k.totalQuestions ?? 0), 0)
    : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-10 pt-[42px] pb-[60px] flex flex-col gap-[22px] w-full">
        {/* 标题区 */}
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.16em] uppercase text-primary-dark flex items-center gap-2 mb-3">
            <span className="inline-block w-[22px] h-[2px] bg-primary-dark" />
            STEP 01 — 学习路径规划
          </div>
          <h1 className="font-display text-[36px] font-medium leading-[1.12] tracking-[-0.03em]">
            三步开启<em className="italic text-primary-dark">由浅入深</em>的刷题旅程
          </h1>
          <p className="mt-3.5 text-[14.5px] text-text-secondary max-w-[560px]">
            选择题库 → 告诉 AI 你的偏好（可选）→ AI 为你生成专属刷题顺序。
          </p>
        </div>

        {/* 步骤 1：选择题库 */}
        <StepCard num={1} title="选择题库" desc="从你已导入的题库中挑一个开始本轮练习。">
          {bank ? (
            <BankPickerCard
              bank={bank}
              banks={banks}
              showPicker={showPicker}
              onToggle={() => setShowPicker((v) => !v)}
              onPick={(id) => {
                setBankId(id);
                setShowPicker(false);
                setPlan(null);
              }}
            />
          ) : null}
        </StepCard>

        {/* 步骤 2：自定义需求 */}
        <StepCard
          num={2}
          title={
            <>
              输入个性化需求
              <span className="ml-2 inline-flex items-center text-[10px] font-bold tracking-[0.05em] px-2 py-0.5 rounded-full bg-background-alt text-text-muted">
                可选
              </span>
            </>
          }
          desc="用一句话告诉 AI 你想怎么学，它会在保证依赖关系的前提下重排顺序。留空则按依赖关系生成。"
        >
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onChip={(c) => setPrompt(c)}
            onSubmit={generateOrder}
            loading={planning}
          />
        </StepCard>

        {/* 步骤 3：AI 结果 */}
        <StepCard
          num={3}
          title="AI 生成的刷题顺序"
          desc="基于知识图谱依赖关系与你的偏好生成，按下方顺序逐个知识点完成。"
        >
          {error && (
            <div className="mb-3 px-3 py-2 rounded-md text-[12.5px] bg-[rgba(201,120,120,0.13)] text-[#a83c3c]">
              {error}
            </div>
          )}
          {!plan && !planning && (
            <div className="text-[12.5px] text-text-muted py-4">
              点击上方「生成刷题顺序」获取 AI 排序结果。
            </div>
          )}
          {planning && (
            <div className="text-[12.5px] text-text-muted py-4">AI 正在为你规划路径……</div>
          )}
          {plan && (
            <>
              {plan.planningNote && <AINote note={plan.planningNote} />}
              <KpOrderList items={plan.orderedKnowledgePoints} />
            </>
          )}
        </StepCard>

        {/* CTA */}
        {plan && (
          <div className="flex items-center justify-between p-[20px_26px] bg-white border border-border rounded-lg shadow-sm">
            <div className="text-[13px] text-text-secondary">
              本次将按
              <b className="font-display text-[18px] text-foreground font-semibold mx-1">
                {plan.orderedKnowledgePoints.length}
              </b>
              个知识点顺序刷题，预计
              <b className="font-display text-[18px] text-foreground font-semibold mx-1">
                {totalQuestions}
              </b>
              道题
            </div>
            <button
              onClick={startPractice}
              disabled={creating}
              className="inline-flex items-center gap-2 px-[30px] py-[13px] rounded-md text-[14.5px] font-bold text-white bg-gradient-to-br from-primary to-primary-dark shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:translate-y-0"
            >
              {creating ? "正在创建…" : "开始刷题"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({
  num,
  title,
  desc,
  children,
}: {
  num: number;
  title: React.ReactNode;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-lg shadow-sm p-[22px_26px] flex gap-[18px]">
      <div className="flex-shrink-0 w-[34px] h-[34px] rounded-[11px] bg-gradient-to-br from-[rgba(159,185,151,0.16)] to-[rgba(159,185,151,0.04)] grid place-items-center font-display font-bold text-[14px] text-primary-dark border border-border-strong">
        {num}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display text-[16px] font-semibold flex items-center gap-2.5 mb-1.5">
          {title}
        </div>
        <div className="text-[12.5px] text-text-muted mb-3.5 leading-[1.55]">{desc}</div>
        {children}
      </div>
    </div>
  );
}

function BankPickerCard({
  bank,
  banks,
  showPicker,
  onToggle,
  onPick,
}: {
  bank: PlanBankOption;
  banks: PlanBankOption[];
  showPicker: boolean;
  onToggle: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3.5 px-4 py-3 rounded-md bg-gradient-to-br from-[rgba(159,185,151,0.08)] to-transparent border border-border">
        <div className="w-[38px] h-[38px] flex-shrink-0 rounded-[10px] bg-gradient-to-br from-primary to-primary-dark grid place-items-center shadow-md">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[15px] font-semibold text-foreground truncate">
            {bank.name}
          </div>
          <div className="text-[11.5px] text-text-muted mt-0.5">
            {bank.totalQuestions} 题 · {bank.knowledgePointCount} 知识点
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-[12px] font-bold text-primary-dark px-3 py-1.5 rounded-[9px] bg-background border border-border hover:bg-white hover:border-primary transition-all"
        >
          {showPicker ? "收起" : "更换"}
        </button>
      </div>
      {showPicker && (
        <div className="mt-2 border border-border rounded-md bg-white max-h-[280px] overflow-y-auto">
          {banks.map((b) => (
            <button
              key={b.id}
              onClick={() => onPick(b.id)}
              className={`w-full text-left px-4 py-2.5 hover:bg-[rgba(159,185,151,0.08)] flex items-center gap-2 ${
                b.id === bank.id ? "bg-[rgba(159,185,151,0.1)]" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{b.name}</div>
                <div className="text-[11px] text-text-muted">
                  {b.totalQuestions} 题 · {b.knowledgePointCount} 知识点
                </div>
              </div>
              {b.id === bank.id && (
                <span className="text-[11px] text-primary-dark font-bold">当前</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptInput({
  value,
  onChange,
  onChip,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onChip: (c: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div>
      <div className="bg-background border-[1.5px] border-border rounded-md px-4 py-3 flex flex-col gap-2.5 focus-within:border-primary focus-within:bg-white transition-all">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如：我想优先刷哈希表和动态规划，基础部分可以快速过"
          className="w-full bg-transparent border-none resize-none outline-none text-[13.5px] leading-[1.55] min-h-[48px] placeholder:text-text-muted"
        />
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => onChip(c)}
              className="text-[11px] font-semibold px-3 py-1 rounded-full bg-white text-text-secondary border border-border hover:bg-[rgba(159,185,151,0.12)] hover:text-primary-dark hover:border-border-strong transition-all"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={onSubmit}
        disabled={loading}
        className="mt-3.5 inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-bold text-[13px] text-white bg-gradient-to-br from-primary to-primary-dark shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:translate-y-0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M21 12a9 9 0 11-3-6.7M21 4v4h-4" />
        </svg>
        {loading ? "生成中…" : "生成刷题顺序"}
      </button>
    </div>
  );
}

function AINote({ note }: { note: string }) {
  return (
    <div className="flex gap-2.5 px-3.5 py-3 bg-[rgba(111,141,181,0.12)] border border-[rgba(111,141,181,0.2)] rounded-md mb-3.5">
      <div className="w-6 h-6 rounded-[8px] flex-shrink-0 bg-gradient-to-br from-[#6f8db5] to-[#4d6fa0] grid place-items-center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
        </svg>
      </div>
      <p className="text-[12.5px] text-text-secondary leading-[1.6]">{note}</p>
    </div>
  );
}

function KpOrderList({ items }: { items: OrderedKnowledgePoint[] }) {
  return (
    <div className="flex flex-col gap-[7px]">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-md bg-background border border-transparent hover:bg-white hover:border-border transition-all"
        >
          <div className="w-[26px] h-[26px] flex-shrink-0 rounded-[8px] grid place-items-center font-display font-semibold text-[13px] bg-[rgba(159,185,151,0.18)] text-primary-dark">
            {item.order}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-foreground truncate">{item.name}</div>
            <div className="text-[11.5px] text-text-muted mt-0.5 truncate">{item.reason}</div>
          </div>
          <span className="text-[11px] text-text-muted whitespace-nowrap">
            {item.totalQuestions} 题
          </span>
        </div>
      ))}
    </div>
  );
}
