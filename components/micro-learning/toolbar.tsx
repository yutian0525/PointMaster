"use client";

import { CheckCircle } from "lucide-react";

interface ToolbarProps {
  knowledgePointName: string;
  cardCount: number;
  finishLabel?: string;
  onFinish: () => void;
}

export function Toolbar({
  knowledgePointName,
  cardCount,
  finishLabel = "完成学习",
  onFinish,
}: ToolbarProps) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-white flex-shrink-0 gap-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-background border border-border-strong rounded-full px-3 py-1">
          <div className="w-[7px] h-[7px] rounded-full bg-primary flex-shrink-0" />
          <span className="text-[13px] font-bold text-foreground">{knowledgePointName}</span>
        </div>
        <span className="text-[12px] text-text-muted">
          {cardCount} 张卡片 · 拖动卡片自由排列 · 选中文字可提问
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onFinish}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold shadow-[0_2px_10px_rgba(107,140,100,0.28)] hover:translate-y-[-1px] hover:shadow-[0_4px_18px_rgba(107,140,100,0.38)] transition-all"
        >
          <CheckCircle size={13} />
          {finishLabel}
        </button>
      </div>
    </div>
  );
}
