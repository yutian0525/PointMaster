"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { OrderedKnowledgePoint } from "@/lib/practice/types";

interface ResumeBannerProps {
  sessionId: string;
  bankId: string;
  bankName: string;
  currentKpName: string;
  answeredCount: number;
  totalQuestions: number;
}

export function ResumeBanner({
  sessionId,
  bankId,
  bankName,
  currentKpName,
  answeredCount,
  totalQuestions,
}: ResumeBannerProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  async function handleAbandon() {
    setAbandoning(true);
    try {
      await fetch(`/api/sessions/${sessionId}/abandon`, { method: "POST" });
      router.push(`/practice/new?bankId=${bankId}`);
    } catch {
      setAbandoning(false);
    }
  }

  if (confirming) {
    return (
      <div className="mx-[38px] mt-4 px-5 py-4 rounded-md bg-[rgba(201,120,120,0.1)] border border-[rgba(201,120,120,0.25)] flex items-center gap-4 flex-wrap">
        <span className="text-[13px] font-semibold text-[#a83c3c] flex-1">
          确认重新开始？当前进度将被废弃，掌握度数据保留。
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="px-3 py-1.5 rounded text-[12.5px] font-bold bg-white border border-border text-text-secondary hover:bg-background transition-all"
          >
            取消
          </button>
          <button
            onClick={handleAbandon}
            disabled={abandoning}
            className="px-3 py-1.5 rounded text-[12.5px] font-bold bg-[#a83c3c] text-white disabled:opacity-60 transition-all"
          >
            {abandoning ? "处理中…" : "确认重新开始"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-[38px] mt-4 px-5 py-3.5 rounded-md bg-[rgba(159,185,151,0.12)] border border-[rgba(159,185,151,0.3)] flex items-center gap-3 flex-wrap">
      <svg
        className="w-4 h-4 text-primary-dark flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span className="text-[13px] text-text-secondary flex-1">
        继续上次刷题：
        <span className="font-semibold text-foreground">{currentKpName}</span>
        {" · "}
        <span className="text-text-muted">
          {answeredCount}/{totalQuestions} 题
        </span>
      </span>
      <div className="flex gap-2 flex-shrink-0">
        <Link
          href={`/practice/${sessionId}/quiz`}
          className="px-3 py-1.5 rounded text-[12.5px] font-bold bg-primary-dark text-white hover:opacity-90 transition-all"
        >
          继续 →
        </Link>
        <button
          onClick={() => setConfirming(true)}
          className="px-3 py-1.5 rounded text-[12.5px] font-bold bg-white border border-border text-text-secondary hover:bg-background hover:text-foreground transition-all"
        >
          重新开始
        </button>
      </div>
    </div>
  );
}
