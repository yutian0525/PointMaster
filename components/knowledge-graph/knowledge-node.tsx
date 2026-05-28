"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

interface KnowledgeNodeData {
  name: string;
  questionCount: number;
  isRoot: boolean;
}

export function KnowledgeNode({ data }: NodeProps) {
  const { name, questionCount, isRoot } = data as unknown as KnowledgeNodeData;

  if (isRoot) {
    return (
      <div className="px-[18px] py-2 rounded-[50px] bg-[#6b8c64] text-white text-[13px] font-semibold cursor-pointer shadow-sm hover:scale-105 hover:shadow-md transition-all whitespace-nowrap">
        <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
        {name}
        <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
      </div>
    );
  }

  return (
    <div className="px-[14px] py-[6px] rounded-[50px] bg-white border-2 border-[#9fb997] text-[12px] font-semibold text-[#6b8c64] cursor-pointer shadow-sm hover:bg-[#9fb997] hover:text-white hover:scale-105 hover:shadow-md transition-all whitespace-nowrap">
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      {name}
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </div>
  );
}
