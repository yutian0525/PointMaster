"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";

interface SelectionPopupProps {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  isCardLevel: boolean;
  loading: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
}

export function SelectionPopup({
  visible,
  x,
  y,
  selectedText,
  isCardLevel,
  loading,
  onAsk,
  onClose,
}: SelectionPopupProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  if (!visible) return null;

  const display = selectedText.length > 14 ? selectedText.slice(0, 14) + "…" : selectedText;
  const placeholder = isCardLevel ? "对该卡片提问…" : `解释「${display}」（可改写问题）`;
  const headerLabel = isCardLevel ? `对「${display}」卡片提问` : `对「${display}」提问`;

  const submit = () => {
    if (loading) return;
    const fallback = isCardLevel ? `请帮我讲讲「${selectedText}」` : `解释「${selectedText}」`;
    const question = input.trim() || fallback;
    onAsk(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed z-[10000] w-[340px] bg-white rounded-lg shadow-[0_8px_30px_rgba(30,40,34,0.18)] border border-border overflow-hidden"
      style={{ left: Math.max(8, x - 170), top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-background border-b border-border">
        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <MessageCircle size={12} />
          <span>{headerLabel}</span>
        </div>
        <button onClick={onClose} disabled={loading} className="text-text-muted hover:text-foreground transition-colors disabled:opacity-50">
          <X size={13} />
        </button>
      </div>
      <div className="px-3 py-2 flex items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={loading}
          maxLength={200}
          className="flex-1 text-[12.5px] text-foreground placeholder:text-text-muted bg-transparent outline-none"
        />
        <button
          onClick={submit}
          disabled={loading}
          className="w-[26px] h-[26px] rounded-md bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>
    </div>
  );
}
