"use client";

import { useRef, useCallback } from "react";
import { AlertTriangle, MessageCircle } from "lucide-react";
import type { CardType } from "@/types";

const CARD_STYLES: Record<CardType, { dotColor: string; label: string; labelColor: string; borderStyle: string; icon?: boolean }> = {
  concept:  { dotColor: "bg-primary-dark", label: "核心概念", labelColor: "text-primary-dark", borderStyle: "border-solid" },
  signal:   { dotColor: "bg-[#5a8ab8]",   label: "识别信号", labelColor: "text-[#3a6898]",    borderStyle: "border-solid" },
  template: { dotColor: "bg-[#5a8ab8]",   label: "解题模板", labelColor: "text-[#3a6898]",    borderStyle: "border-solid" },
  pitfall:  { dotColor: "bg-[#b85858]",   label: "易错点",   labelColor: "text-[#a04040]",    borderStyle: "border-solid", icon: true },
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
  onAskCard: (cardId: string, cardContent: string) => void;
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
  onAskCard,
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
    if (text.length > 0 && text.length <= 50) {
      const range = sel!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        onTextSelect(id, text, rect, content);
      }
    }
  }, [id, content, onTextSelect]);

  return (
    <div
      className={`absolute w-[280px] bg-white ${style.borderStyle} border-[1.5px] border-border rounded-md overflow-hidden shadow-sm hover:border-primary-light hover:shadow-md transition-shadow select-none`}
      style={{ left: x, top: y }}
      data-card-id={id}
    >
      <div
        className="px-3.5 py-2.5 border-b border-border flex items-center gap-2 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
      >
        {style.icon ? (
          <AlertTriangle size={11} className="text-[#b85858] flex-shrink-0" />
        ) : (
          <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${style.dotColor}`} />
        )}
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

      <div className="px-3.5 py-2 bg-background border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          <MessageCircle size={10} />
          选中文字提问
        </span>
        <button
          onClick={() => onAskCard(id, content)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-text-secondary hover:text-primary-dark hover:bg-[rgba(159,185,151,0.12)] transition-all"
        >
          <MessageCircle size={10} />
          提问
        </button>
      </div>
    </div>
  );
}

function formatContent(content: string): string {
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/\n/g, "<br>");
}
