"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

interface KnowledgeNodeData {
  name: string;
  questionCount: number;
  avgDifficulty: number | null;
  isRoot: boolean;
}

function DifficultyDot({ difficulty }: { difficulty: number }) {
  let color = "#9fb997";
  if (difficulty >= 0.8) color = "#c85a5a";
  else if (difficulty >= 0.6) color = "#e68a50";
  else if (difficulty >= 0.4) color = "#e6b450";
  return (
    <span
      className="inline-block w-[6px] h-[6px] rounded-full mr-0.5"
      style={{ backgroundColor: color }}
    />
  );
}

export function KnowledgeNode({ data }: NodeProps) {
  const { name, questionCount, avgDifficulty, isRoot } = data as unknown as KnowledgeNodeData;

  const badge = (
    <div className="flex items-center gap-1.5 mt-0.5 justify-center">
      <span className="text-[9.5px] opacity-75">{questionCount}题</span>
      {avgDifficulty != null && (
        <span className="flex items-center text-[9.5px] opacity-75">
          <DifficultyDot difficulty={avgDifficulty} />
          {avgDifficulty.toFixed(2)}
        </span>
      )}
    </div>
  );

  if (isRoot) {
    return (
      <div className="px-[18px] py-2 rounded-[16px] bg-[#6b8c64] text-white text-[13px] font-semibold cursor-pointer shadow-sm hover:scale-105 hover:shadow-md transition-all text-center">
        <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
        <div className="whitespace-nowrap">{name}</div>
        {badge}
        <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
      </div>
    );
  }

  return (
    <div className="px-[14px] py-[6px] rounded-[16px] bg-white border-2 border-[#9fb997] text-[12px] font-semibold text-[#6b8c64] cursor-pointer shadow-sm hover:bg-[#9fb997] hover:text-white hover:scale-105 hover:shadow-md transition-all text-center">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div className="whitespace-nowrap">{name}</div>
      {badge}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </div>
  );
}
