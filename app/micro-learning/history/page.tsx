"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Clock, ArrowLeft, Layers } from "lucide-react";
import type { HistoryListItem } from "@/types";

interface HistoryRecord extends HistoryListItem {
  bankId?: string;
}

export default function MicroLearningHistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/micro-learning/history")
      .then((r) => r.json())
      .then((data) => setRecords(data.records || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border bg-white flex-shrink-0">
        <Link
          href="/banks"
          className="w-[32px] h-[32px] rounded-lg bg-background border border-border flex items-center justify-center text-text-secondary hover:text-foreground hover:bg-background-alt transition-all"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="font-display text-[20px] font-bold text-foreground tracking-tight">
            微学习记录
          </h1>
          <p className="text-[12px] text-text-muted mt-0.5">
            所有微学习历史记录，点击可继续学习
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[13px] text-text-muted">加载中…</div>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <BookOpen size={40} className="text-text-muted mb-3 opacity-40" />
            <div className="text-[14px] text-text-secondary mb-1">暂无微学习记录</div>
            <div className="text-[12px] text-text-muted">从知识图谱中选择知识点开始微学习</div>
          </div>
        ) : (
          <div className="grid gap-3 max-w-[720px]">
            {records.map((record) => (
              <Link
                key={record.id}
                href={`/micro-learning/${record.knowledgePointId}?bankId=${record.bankId || ""}`}
                className="block bg-white rounded-lg p-4 border border-border hover:border-primary-light hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-foreground group-hover:text-primary-dark transition-colors truncate">
                      {record.knowledgePointName}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-[11.5px] text-text-muted">
                        <Layers size={11} />
                        {record.cardCount} 张卡片
                      </span>
                      {record.extendedCardCount > 0 && (
                        <span className="text-[11.5px] text-text-muted">
                          + {record.extendedCardCount} 张延伸
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-text-muted flex-shrink-0">
                    <Clock size={11} />
                    {new Date(record.createdAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
