"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ExternalLink, Clock, Layers } from "lucide-react";
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
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="font-display text-[16px] font-semibold text-foreground">学习历史</div>
          <div className="flex items-center gap-2">
            <Link
              href="/micro-learning/history"
              className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-primary-dark transition-colors"
            >
              <ExternalLink size={11} />
              查看全部
            </Link>
            <button
              onClick={onClose}
              className="w-[28px] h-[28px] rounded-full bg-background flex items-center justify-center text-text-muted hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

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
                  <div className="flex items-center gap-2 text-[11.5px] text-text-muted">
                    <span className="flex items-center gap-1">
                      <Layers size={10} />
                      {record.cardCount} 张卡片
                    </span>
                    {record.extendedCardCount > 0 && (
                      <span>+ {record.extendedCardCount} 延伸</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-text-muted mt-1">
                    <Clock size={10} />
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
