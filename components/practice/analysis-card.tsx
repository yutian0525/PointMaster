export function AnalysisCard({ analysis }: { analysis: string }) {
  if (!analysis?.trim()) return null;
  return (
    <div className="bg-white border border-border rounded-md px-5 py-[18px] shadow-sm">
      <div className="text-[11px] font-extrabold tracking-[0.1em] uppercase text-text-muted mb-2.5 flex items-center gap-2">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2zM9 21h6" />
        </svg>
        解析
      </div>
      <p className="text-[13.5px] text-text-secondary leading-[1.68] whitespace-pre-wrap">
        {analysis}
      </p>
    </div>
  );
}
