"use client";

import { useRef, useCallback } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import type { CardType } from "@/types";

const CARD_STYLES: Record<CardType, {
  dotColor: string;
  label: string;
  labelColor: string;
  borderStyle: string;
  width: number;
}> = {
  detail:   { dotColor: "bg-primary-dark", label: "知识点详解", labelColor: "text-primary-dark", borderStyle: "border-solid", width: 320 },
  example:  { dotColor: "bg-[#5a8ab8]",    label: "例题分析",   labelColor: "text-[#3a6898]",    borderStyle: "border-solid", width: 280 },
  extended: { dotColor: "bg-[#b89040]",    label: "延伸",       labelColor: "text-[#a07020]",    borderStyle: "border-dashed", width: 280 },
};

interface ExampleMeta {
  options: string[];
  answer: string;
  userAnswer?: string;
  isWrong?: boolean;
}

interface LearningCardProps {
  id: string;
  type: CardType;
  title: string;
  content: string;
  questionMeta?: ExampleMeta;
  sourceKeyword?: string;
  questionId?: string;
  x: number;
  y: number;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onTextSelect: (cardId: string, text: string, rect: DOMRect, cardContent: string) => void;
  onRetryExample?: (questionId: string) => void;
  retrying?: boolean;
}

export function LearningCard({
  id,
  type,
  title,
  content,
  questionMeta,
  sourceKeyword,
  questionId,
  x,
  y,
  onDragStart,
  onTextSelect,
  onRetryExample,
  retrying,
}: LearningCardProps) {
  const style = CARD_STYLES[type];
  const bodyRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      onDragStart(id, e);
    },
    [id, onDragStart]
  );

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || "";
    if (text.length > 0 && text.length <= 30) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        onTextSelect(id, text, rect, content);
      }
    }
  }, [id, content, onTextSelect]);

  const isExampleWrong = type === "example" && questionMeta?.isWrong;
  const showRetry = type === "example" && (!content || content.trim() === "") && questionId && onRetryExample;

  return (
    <div
      className={`absolute bg-white ${style.borderStyle} border-[1.5px] ${isExampleWrong ? "border-r-[2px] border-r-[#b85858]" : ""} border-border rounded-md overflow-hidden shadow-sm hover:border-primary-light hover:shadow-md transition-shadow select-none`}
      style={{ left: x, top: y, width: style.width }}
      data-card-id={id}
    >
      <div
        className="px-3.5 py-2.5 border-b border-border flex items-center gap-2 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
      >
        <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${style.dotColor}`} />
        <span className={`text-[10px] font-bold tracking-wider uppercase ${style.labelColor}`}>
          {style.label}
        </span>
        {sourceKeyword && (
          <span className="ml-auto text-[10px] text-text-muted truncate max-w-[120px]">
            来自「{sourceKeyword}」
          </span>
        )}
      </div>

      <div
        ref={bodyRef}
        className="px-3.5 py-3 select-text cursor-text"
        onMouseUp={handleMouseUp}
      >
        <div className="font-display text-[14px] font-semibold text-foreground mb-1.5 tracking-tight">
          {title}
        </div>

        {type === "example" && questionMeta && (
          <div className="text-[12.5px] leading-[1.6] text-text-secondary mb-2">
            <div className="my-2 border-t border-border" />
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px]">
              {questionMeta.options.map((o, i) => (
                <div key={i}>
                  <span className="font-semibold text-foreground">{String.fromCharCode(65 + i)}.</span> {o}
                </div>
              ))}
            </div>
            <div className="my-2 border-t border-border" />
            <div className="text-[12px]">
              <span className="text-primary-dark font-semibold">✓ 标准答案：{questionMeta.answer}</span>
              {questionMeta.userAnswer !== undefined && (
                <span className={`ml-3 ${questionMeta.isWrong ? "text-[#b85858]" : "text-text-muted"} font-semibold`}>
                  {questionMeta.isWrong ? "✗ 你的作答" : "✓ 你的作答"}：{questionMeta.userAnswer}
                </span>
              )}
            </div>
          </div>
        )}

        {type === "example" && (
          <div className="my-2 border-t border-border" />
        )}

        {showRetry ? (
          <div className="flex items-center gap-2 py-2">
            <span className="text-[12px] text-[#b85858]">AI 分析缺失</span>
            <button
              onClick={() => questionId && onRetryExample?.(questionId)}
              disabled={retrying}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-primary-dark bg-[rgba(159,185,151,0.12)] hover:bg-[rgba(159,185,151,0.22)] transition-all disabled:opacity-50"
            >
              <RefreshCw size={11} className={retrying ? "animate-spin" : ""} />
              {retrying ? "重试中…" : "点击重试"}
            </button>
          </div>
        ) : (
          <div
            className="text-[12.5px] leading-[1.7] text-text-secondary whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: formatContent(content) }}
          />
        )}
      </div>

      <div className="px-3.5 py-2 bg-background border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          <MessageCircle size={10} />
          选中文字提问
        </span>
      </div>
    </div>
  );
}

function formatContent(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/^## (.+)$/gm, '<div class="font-display text-[12.5px] font-semibold text-foreground mt-2 mb-1">$1</div>')
    .replace(/\n/g, "<br>");
}
