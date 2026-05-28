"use client";

import { useEffect, useState, useCallback } from "react";
import type { BankStatus, GraphData } from "@/types";

interface BankDetailClientProps {
  bankId: string;
  initialBank: {
    id: string;
    name: string;
    totalQuestions: number;
    status: string;
    progress: number;
    progressMessage: string | null;
    knowledgePointCount: number;
    createdAt: number;
  };
}

export function BankDetailClient({ bankId, initialBank }: BankDetailClientProps) {
  const [bank, setBank] = useState(initialBank);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/banks/${bankId}/status`);
    if (res.ok) {
      const data: BankStatus = await res.json();
      setBank((prev) => ({
        ...prev,
        status: data.status,
        progress: data.progress,
        progressMessage: data.progressMessage,
      }));
      return data.status;
    }
    return bank.status;
  }, [bankId, bank.status]);

  const fetchGraph = useCallback(async () => {
    setLoadingGraph(true);
    const res = await fetch(`/api/banks/${bankId}/graph`);
    if (res.ok) {
      const data: GraphData = await res.json();
      setGraphData(data);
    }
    setLoadingGraph(false);
  }, [bankId]);

  useEffect(() => {
    if (bank.status === "completed") {
      fetchGraph();
      return;
    }

    if (bank.status === "pending" || bank.status === "failed") {
      return;
    }

    // Poll while processing
    const interval = setInterval(async () => {
      const status = await fetchStatus();
      if (status === "completed" || status === "failed") {
        clearInterval(interval);
        if (status === "completed") {
          fetchGraph();
          // Refresh bank detail
          const res = await fetch(`/api/banks/${bankId}`);
          if (res.ok) {
            const data = await res.json();
            setBank(data);
          }
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [bank.status, bankId, fetchStatus, fetchGraph]);

  const isProcessing = bank.status === "extracting" || bank.status === "building_graph";

  async function handleRetry() {
    await fetch(`/api/banks/${bankId}/process`, { method: "POST" });
    setBank((prev) => ({ ...prev, status: "extracting", progress: 0 }));
  }

  return (
    <div className="flex-1 px-[38px] py-6 overflow-y-auto">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 mt-5">
        <div className="bg-white border border-border rounded-md p-[18px]">
          <div className="font-display text-[34px] font-bold text-foreground leading-none">
            {bank.totalQuestions}
          </div>
          <div className="text-[12.5px] text-text-muted mt-0.5">题目总数</div>
        </div>
        <div className="bg-white border border-border rounded-md p-[18px]">
          <div className="font-display text-[34px] font-bold text-foreground leading-none">
            {bank.knowledgePointCount}
          </div>
          <div className="text-[12.5px] text-text-muted mt-0.5">知识点总数</div>
          {bank.status !== "completed" && (
            <div className="text-[11.5px] text-primary-dark mt-2">
              {isProcessing ? "提取中..." : "待处理"}
            </div>
          )}
        </div>
      </div>

      {/* Processing progress */}
      {isProcessing && (
        <div className="bg-white border border-border rounded-md p-[18px] mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-semibold text-foreground">AI 解析进度</div>
            <span className="text-[12.5px] font-bold text-primary-dark">{bank.progress}%</span>
          </div>
          <div className="w-full h-[6px] bg-background-alt rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary-dark rounded-full transition-all duration-500"
              style={{ width: `${bank.progress}%` }}
            />
          </div>
          {bank.progressMessage && (
            <div className="text-[11.5px] text-text-muted mt-2">{bank.progressMessage}</div>
          )}
        </div>
      )}

      {/* Failed state */}
      {bank.status === "failed" && (
        <div className="bg-white border border-[rgba(200,90,90,0.3)] rounded-md p-[18px] mt-4">
          <div className="text-[13px] font-semibold text-[#9a3830] mb-1">处理失败</div>
          <div className="text-[12px] text-text-muted mb-3">{bank.progressMessage}</div>
          <button
            onClick={handleRetry}
            className="px-3 py-1.5 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold"
          >
            重新处理
          </button>
        </div>
      )}

      {/* Knowledge Graph placeholder - will be replaced by Task 10 */}
      {bank.status === "completed" && (
        <div className="mt-5">
          <div className="bg-white border border-border rounded-lg overflow-hidden" style={{ height: "400px" }}>
            {loadingGraph ? (
              <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
                加载知识图谱...
              </div>
            ) : graphData && graphData.nodes.length > 0 ? (
              <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
                知识图谱数据已加载（{graphData.nodes.length} 个节点）— 可视化组件将在 Task 10 中实现
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-[13px]">
                暂无知识图谱数据
              </div>
            )}
          </div>
          <div className="mt-2.5 text-[11.5px] text-text-muted">
            → 点击任意节点可查看知识点详情及例题 · 箭头方向 = 学习依赖关系
          </div>
        </div>
      )}
    </div>
  );
}
