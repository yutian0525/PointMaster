"use client";

import { MessageCircle, X, Loader2 } from "lucide-react";

interface SelectionPopupProps {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function SelectionPopup({
  visible,
  x,
  y,
  selectedText,
  loading,
  onConfirm,
  onClose,
}: SelectionPopupProps) {
  if (!visible) return null;

  const display = selectedText.length > 12 ? selectedText.slice(0, 12) + "…" : selectedText;

  return (
    <div
      className="fixed z-[10000] bg-white rounded-lg shadow-[0_8px_30px_rgba(30,40,34,0.18)] border border-border overflow-hidden"
      style={{ left: Math.max(8, x - 120), top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-background border-b border-border min-w-[220px]">
        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <MessageCircle size={12} />
          <span>对「{display}」提问</span>
        </div>
        <button
          onClick={onClose}
          disabled={loading}
          className="text-text-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <X size={13} />
        </button>
      </div>
      <button
        onClick={onConfirm}
        disabled={loading}
        className="w-full px-3 py-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-primary-dark hover:bg-[rgba(159,185,151,0.1)] transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={12} className="animate-spin" />
            生成中…
          </>
        ) : (
          <>💬 解释「{display}」</>
        )}
      </button>
    </div>
  );
}
