interface RevealBannerProps {
  score: 0 | 1;
  correctAnswer: string;
  kpName?: string;
}

export function RevealBanner({ score, correctAnswer, kpName }: RevealBannerProps) {
  const ok = score === 1;
  return (
    <div
      className={`flex items-center gap-2.5 px-[18px] py-3.5 rounded-md font-bold text-[14px] mb-4 ${
        ok
          ? "bg-[rgba(159,185,151,0.16)] text-[#4f6b49]"
          : "bg-[rgba(201,120,120,0.13)] text-[#a83c3c]"
      }`}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        {ok ? <path d="M20 6L9 17l-5-5" /> : <path d="M18 6L6 18M6 6l12 12" />}
      </svg>
      {ok ? "答对了" : `答错了 — 正确答案是 ${correctAnswer}`}
      {kpName && (
        <span className="ml-auto text-[11.5px] font-semibold opacity-80">
          该题关联：{kpName}
        </span>
      )}
    </div>
  );
}
