"use client";

import { History, CheckCircle, Loader2 } from "lucide-react";

interface ToolbarProps {
  knowledgePointName: string;
  cardCount: number;
  onOpenHistory: () => void;
  onComplete: () => void;
  completing: boolean;
  saved?: boolean;
}

export function Toolbar({
  knowledgePointName,
  cardCount,
  onOpenHistory,
  onComplete,
  completing,
  saved,
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
        {saved !== undefined && (
          <span className="text-[11px] text-text-muted flex items-center gap-1">
            {saved ? (
              <>
                <CheckCircle size={11} className="text-primary" />
                已自动保存
              </>
            ) : (
              <>
                <Loader2 size={11} className="animate-spin" />
                保存中…
              </>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onOpenHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-background text-text-secondary border border-border-strong text-[12px] font-semibold hover:bg-white hover:text-foreground transition-all"
        >
          <History size={13} />
          历史记录
        </button>
        <button
          onClick={onComplete}
          disabled={completing}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold shadow-[0_2px_10px_rgba(107,140,100,0.28)] hover:translate-y-[-1px] hover:shadow-[0_4px_18px_rgba(107,140,100,0.38)] transition-all disabled:opacity-50"
        >
          {completing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <CheckCircle size={13} />
          )}
          {completing ? "保存中…" : "完成学习"}
        </button>
      </div>
    </div>
  );
}
