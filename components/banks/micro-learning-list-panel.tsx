"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, BookOpen, MessageCircle, RotateCcw } from "lucide-react";
import type { MicroLearningListItem } from "@/types/micro-learning";

interface MicroLearningListPanelProps {
  bankId: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MicroLearningListPanel({ bankId }: MicroLearningListPanelProps) {
  const [open, setOpen] = useState(true);
  const [records, setRecords] = useState<MicroLearningListItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/micro-learning?bankId=${encodeURIComponent(bankId)}`);
      if (!res.ok) {
        setRecords([]);
        return;
      }
      const data = await res.json();
      setRecords(Array.isArray(data?.records) ? data.records : []);
    } catch (err) {
      console.error("[micro-learning panel] load failed", err);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [bankId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <div className="mt-5 bg-white border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-[18px] py-3 flex items-center justify-between hover:bg-background transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-primary-dark" />
          <span className="font-display text-[14px] font-semibold text-foreground">
            微学习记录{records ? ` (${records.length})` : ""}
          </span>
        </div>
        {open ? (
          <ChevronDown size={14} className="text-text-muted" />
        ) : (
          <ChevronRight size={14} className="text-text-muted" />
        )}
      </button>

      {open && (
        <div className="border-t border-border">
          {loading && !records ? (
            <div className="px-[18px] py-6 text-center text-[12.5px] text-text-muted">加载中…</div>
          ) : records && records.length === 0 ? (
            <div className="px-[18px] py-6 text-center text-[12.5px] text-text-muted">
              该题库还没有微学习记录，可从知识点入口开始
            </div>
          ) : (
            <div>
              {records?.map((r) => (
                <div
                  key={r.id}
                  className="px-[18px] py-2.5 border-b border-border last:border-b-0 flex items-center gap-3 hover:bg-background transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-foreground truncate">
                      {r.knowledgePointName}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-text-muted mt-0.5">
                      <span>{r.sessionId ? "Session 触发" : "手动"}</span>
                      <span>{r.exampleCount} 道例题</span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={10} />
                        {r.extendedCardCount}
                      </span>
                      <span>{formatTime(r.createdAt)}</span>
                    </div>
                  </div>
                  <Link
                    href={`/micro-learning/${r.id}`}
                    className="px-2.5 py-1 rounded-md bg-background text-text-secondary text-[11.5px] font-semibold hover:bg-white hover:text-foreground transition-all border border-border"
                  >
                    查看
                  </Link>
                  <Link
                    href={`/micro-learning/new?kpId=${r.knowledgePointId}&bankId=${bankId}`}
                    className="px-2.5 py-1 rounded-md text-[11.5px] font-semibold text-primary-dark bg-[rgba(159,185,151,0.14)] hover:bg-[rgba(159,185,151,0.24)] transition-all flex items-center gap-1"
                  >
                    <RotateCcw size={11} />
                    重新学习
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
