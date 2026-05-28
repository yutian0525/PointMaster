"use client";

import Link from "next/link";

interface BankCardProps {
  bank: {
    id: string;
    name: string;
    totalQuestions: number;
    status: string;
    progress: number;
    progressMessage: string | null;
    createdAt: number;
  };
}

function StatusChip({ status, progress }: { status: string; progress: number }) {
  switch (status) {
    case "pending":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.1)] text-text-muted">等待处理</span>;
    case "extracting":
    case "building_graph":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.15)] text-primary-dark">AI 解析中... {progress}%</span>;
    case "completed":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(107,140,100,0.14)] text-primary-dark">已完成 ✓</span>;
    case "failed":
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(200,90,90,0.14)] text-[#9a3830]">处理失败</span>;
    default:
      return null;
  }
}

export function BankCard({ bank }: BankCardProps) {
  const date = new Date(bank.createdAt).toLocaleDateString("zh-CN");

  return (
    <Link
      href={`/banks/${bank.id}`}
      className="block bg-white border border-border rounded-md p-[18px] transition-all relative overflow-hidden hover:-translate-y-0.5 hover:shadow-md group"
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary to-primary-dark rounded-t-[3px]" />
      <div className="text-[28px] mb-3">📐</div>
      <div className="font-display text-[15.5px] font-semibold text-foreground mb-1">
        {bank.name}
      </div>
      <div className="text-[11.5px] text-text-muted mb-3">
        {bank.totalQuestions} 题 · 导入 {date}
      </div>
      <StatusChip status={bank.status} progress={bank.progress} />

      {(bank.status === "extracting" || bank.status === "building_graph") && (
        <div className="mt-3">
          <div className="w-full h-[5px] bg-background-alt rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full transition-all duration-700"
              style={{ width: `${bank.progress}%` }}
            />
          </div>
          {bank.progressMessage && (
            <div className="text-[10.5px] text-text-muted mt-1">{bank.progressMessage}</div>
          )}
        </div>
      )}
    </Link>
  );
}
