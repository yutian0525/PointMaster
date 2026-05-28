"use client";

interface SelectionPopupProps {
  visible: boolean;
  x: number;
  y: number;
  text: string;
  loading: boolean;
  onAsk: () => void;
}

export function SelectionPopup({ visible, x, y, text, loading, onAsk }: SelectionPopupProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed z-[10000] flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-foreground text-white text-[12px] font-medium cursor-pointer shadow-lg whitespace-nowrap"
      style={{ left: x, top: y }}
      onClick={onAsk}
    >
      {loading ? (
        <span>生成中…</span>
      ) : (
        <>
          <span>💬</span>
          <span>对「{text.length > 8 ? text.slice(0, 8) + "…" : text}」提问</span>
        </>
      )}
      {/* Triangle pointer */}
      <div
        className="absolute w-[10px] h-[6px] left-1/2 -translate-x-1/2 -bottom-[5px]"
        style={{
          background: "#1e2822",
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
        }}
      />
    </div>
  );
}
