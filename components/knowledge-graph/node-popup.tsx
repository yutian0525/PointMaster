"use client";

import Link from "next/link";
import type { KnowledgePointNode } from "@/types";

interface NodePopupProps {
  node: KnowledgePointNode;
  allNodes: KnowledgePointNode[];
  bankId: string;
  onClose: () => void;
}

export function NodePopup({ node, allNodes, bankId, onClose }: NodePopupProps) {
  const prerequisites = node.prerequisiteIds
    .map((id) => allNodes.find((n) => n.id === id))
    .filter(Boolean);

  return (
    <div
      className="fixed inset-0 bg-[rgba(30,40,34,0.32)] z-[2000] flex items-center justify-center backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-[520px] max-h-[80vh] overflow-hidden flex flex-col shadow-[0_20px_60px_rgba(30,40,34,0.22),0_4px_16px_rgba(30,40,34,0.1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-start justify-between flex-shrink-0">
          <div>
            <div className="font-display text-[22px] font-bold text-foreground tracking-tight mb-1.5">
              {node.name}
            </div>
            <div className="text-[13px] text-text-secondary leading-relaxed max-w-[380px]">
              {node.description || "暂无描述"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-full bg-background flex items-center justify-center text-text-muted hover:bg-background-alt hover:text-foreground transition-all flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5">
          <div className="flex gap-1.5 flex-wrap mb-4">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.2)] text-primary-dark">
              {node.questionCount} 道题
            </span>
            {prerequisites.length === 0 ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(159,185,151,0.1)] text-text-muted">
                无前置要求
              </span>
            ) : (
              prerequisites.map((p) => (
                <span
                  key={p!.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(200,165,110,0.18)] text-[#7a5820]"
                >
                  前置：{p!.name}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-border flex gap-2.5 justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[9px] bg-background text-text-secondary border border-border-strong text-[12.5px] font-semibold hover:bg-white hover:text-foreground transition-all"
          >
            关闭
          </button>
          <Link
            href={`/micro-learning/${node.id}?bankId=${bankId}`}
            className="px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[12.5px] font-semibold shadow-[0_2px_10px_rgba(107,140,100,0.28)] hover:translate-y-[-1px] hover:shadow-[0_4px_18px_rgba(107,140,100,0.38)] transition-all"
          >
            进入微学习 →
          </Link>
        </div>
      </div>
    </div>
  );
}
