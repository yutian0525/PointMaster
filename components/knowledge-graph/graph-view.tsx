"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { KnowledgeNode } from "./knowledge-node";
import { NodePopup } from "./node-popup";
import type { GraphData, KnowledgePointNode } from "@/types";

const nodeTypes: NodeTypes = {
  knowledgeNode: KnowledgeNode,
};

function getLayoutedElements(data: GraphData) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 60 });

  for (const node of data.nodes) {
    g.setNode(node.id, { width: 160, height: 56 });
  }
  for (const edge of data.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node[] = data.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: "knowledgeNode",
      data: {
        name: node.name,
        questionCount: node.questionCount,
        avgDifficulty: node.avgDifficulty,
        isRoot: node.prerequisiteIds.length === 0,
      },
      position: { x: pos.x - 80, y: pos.y - 28 },
    };
  });

  const edges: Edge[] = data.edges.map((edge) => ({
    id: `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    type: "default",
    style: { stroke: "#9fb997", strokeWidth: 1.5, strokeOpacity: 0.7 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#9fb997" },
  }));

  return { nodes, edges };
}

interface GraphViewProps {
  data: GraphData;
  bankName: string;
  bankId: string;
}

export function GraphView({ data, bankName, bankId }: GraphViewProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => getLayoutedElements(data),
    [data]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<KnowledgePointNode | null>(null);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const found = data.nodes.find((n) => n.id === node.id);
      if (found) setSelectedNode(found);
    },
    [data.nodes]
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#c8d4c0" gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-white !border-border !shadow-sm !rounded-lg"
        />
      </ReactFlow>

      {selectedNode && (
        <NodePopup
          node={selectedNode}
          allNodes={data.nodes}
          bankId={bankId}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </>
  );
}
