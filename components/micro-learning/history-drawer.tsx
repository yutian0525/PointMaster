"use client";

import { useEffect, useState } from "react";
import type { HistoryListItem } from "@/types";

interface HistoryDrawerProps {
  open: boolean;
  knowledgePointId: string;
  onClose: () => void;
  onLoadRecord: (recordId: string) => void;
}

export function HistoryDrawer({ open, knowledgePointId, onClose, onLoadRecord }: HistoryDrawerProps) {
  const [records, setRecords] = useState<HistoryListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/micro-learning/history?knowledgePointId=${knowledgePointId}`)
      .then((r) => r.json())
      .then((data) => setRecords(data.records || []))
      .finally(() => setLoading(false));
  }, [open, knowledgePointId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[3000]" onClick={onClose}>
      <div className="absolute inset-0 bg-[rgba(30,40,34,0.2)]" />
      <div
        className="absolute right-0 top-0 bottom-0 w-[360px] bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="font-display text-[16px] font-semibold text-foreground">学习历史</div>
          <button
            onClick={onClose}
            className="w-[28px] h-[28px] rounded-full bg-background flex items-center justify-center text-text-muted hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-[13px] text-text-muted text-center py-8">加载中…</div>
          ) : records.length === 0 ? (
            <div className="text-[13px] text-text-muted text-center py-8">暂无历史记录</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {records.map((record) => (
                <button
                  key={record.id}
                  onClick={() => onLoadRecord(record.id)}
                  className="w-full text-left bg-background rounded-md p-3.5 border border-border hover:border-border-strong hover:shadow-sm transition-all"
                >
                  <div className="text-[13px] font-semibold text-foreground mb-1">
                    {record.knowledgePointName}
                  </div>
                  <div className="text-[11.5px] text-text-muted">
                    {record.cardCount} 张基础卡片
                    {record.extendedCardCount > 0 && ` · ${record.extendedCardCount} 张延伸卡片`}
                  </div>
                  <div className="text-[11px] text-text-muted mt-1">
                    {new Date(record.createdAt).toLocaleString("zh-CN")}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
