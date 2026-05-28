"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";

interface SelectionPopupProps {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
  loading: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
}

export function SelectionPopup({ visible, x, y, selectedText, loading, onAsk, onClose }: SelectionPopupProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  if (!visible) return null;

  const handleSubmit = () => {
    const question = input.trim() || `解释「${selectedText}」`;
    onAsk(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed z-[10000] w-[320px] bg-white rounded-lg shadow-[0_8px_30px_rgba(30,40,34,0.18)] border border-border overflow-hidden"
      style={{ left: Math.max(8, x - 160), top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-background border-b border-border">
        <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
          <MessageCircle size={12} />
          <span>对「{selectedText.length > 12 ? selectedText.slice(0, 12) + "…" : selectedText}」提问</span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="px-3 py-2.5 flex items-center gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`解释「${selectedText}」`}
          disabled={loading}
          className="flex-1 text-[12.5px] text-foreground placeholder:text-text-muted bg-transparent outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-[26px] h-[26px] rounded-md bg-primary text-white flex items-center justify-center hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </button>
      </div>
    </div>
  );
}
