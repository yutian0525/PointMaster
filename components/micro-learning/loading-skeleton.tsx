"use client";

export function LoadingSkeleton() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="flex gap-3 mb-4 justify-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-[260px] h-[180px] rounded-md bg-white border border-border animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <div className="text-[13px] text-text-muted">AI 正在生成学习卡片…</div>
      </div>
    </div>
  );
}
