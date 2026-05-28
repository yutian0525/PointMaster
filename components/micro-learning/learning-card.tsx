"use client";

import { useRef, useCallback } from "react";
import type { CardType } from "@/types";

const CARD_STYLES: Record<CardType, { dotColor: string; label: string; labelColor: string; borderStyle: string }> = {
  concept:  { dotColor: "bg-primary-dark", label: "核心概念", labelColor: "text-primary-dark", borderStyle: "border-solid" },
  signal:   { dotColor: "bg-[#5a8ab8]",   label: "识别信号", labelColor: "text-[#3a6898]",    borderStyle: "border-solid" },
  template: { dotColor: "bg-[#5a8ab8]",   label: "解题模板", labelColor: "text-[#3a6898]",    borderStyle: "border-solid" },
  pitfall:  { dotColor: "bg-[#b85858]",   label: "⚠️ 易错点", labelColor: "text-[#a04040]",   borderStyle: "border-solid" },
  example:  { dotColor: "bg-[#6a8c60]",   label: "典型例题", labelColor: "text-[#4a7040]",    borderStyle: "border-solid" },
  extended: { dotColor: "bg-[#b89040]",   label: "延伸卡片", labelColor: "text-[#a07020]",    borderStyle: "border-dashed" },
};

interface LearningCardProps {
  id: string;
  type: CardType;
  title: string;
  content: string;
  importance: "required" | "recommended";
  sourceKeyword?: string;
  x: number;
  y: number;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onTextSelect: (cardId: string, text: string, rect: DOMRect, cardContent: string) => void;
}

export function LearningCard({
  id,
  type,
  title,
  content,
  importance,
  sourceKeyword,
  x,
  y,
  onDragStart,
  onTextSelect,
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
    if (text.length > 0 && text.length < 30) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      onTextSelect(id, text, rect, content);
    }
  }, [id, content, onTextSelect]);

  return (
    <div
      className={`absolute w-[280px] bg-white ${style.borderStyle} border-[1.5px] border-border rounded-md overflow-hidden shadow-sm hover:border-primary-light hover:shadow-md transition-shadow select-none`}
      style={{ left: x, top: y }}
      data-card-id={id}
    >
      {/* Header — drag handle */}
      <div
        className="px-3.5 py-2.5 border-b border-border flex items-center gap-2 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
      >
        <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${style.dotColor}`} />
        <span className={`text-[10px] font-bold tracking-wider uppercase ${style.labelColor}`}>
          {style.label}
        </span>
        {importance === "required" && (
          <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-medium bg-[rgba(159,185,151,0.2)] text-primary-dark">
            必读
          </span>
        )}
        {sourceKeyword && (
          <span className="ml-auto text-[10px] text-text-muted">
            来自「{sourceKeyword}」
          </span>
        )}
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        className="px-3.5 py-3 select-text cursor-text"
        onMouseUp={handleMouseUp}
      >
        <div className="font-display text-[14px] font-semibold text-foreground mb-1.5 tracking-tight">
          {title}
        </div>
        <div
          className="text-[12.5px] leading-[1.7] text-text-secondary whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: formatContent(content) }}
        />
      </div>

      {/* Footer */}
      <div className="px-3.5 py-2 bg-background border-t border-border">
        <span className="text-[10px] text-text-muted">💬 选中文字提问</span>
      </div>
    </div>
  );
}

function formatContent(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/\n/g, "<br>");
}
