"use client";

import type { CardConnection, CardType } from "@/types";

interface CardPosition {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CardConnectionsProps {
  connections: CardConnection[];
  cardPositions: CardPosition[];
}

const CONNECTION_COLORS: Record<string, string> = {
  "提问延伸": "#c8aa68",
  "模板应用": "#5a8ab8",
  "识别依据": "#5a8ab8",
};
const DEFAULT_CONNECTION_COLOR = "#9fb997";

export function CardConnections({ connections, cardPositions }: CardConnectionsProps) {
  const getCenter = (cardId: string) => {
    const pos = cardPositions.find((p) => p.id === cardId);
    if (!pos) return null;
    return { x: pos.x + pos.width / 2, y: pos.y + pos.height / 2 };
  };

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
      <defs>
        <marker id="ml-arrow-green" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#9fb997" />
        </marker>
        <marker id="ml-arrow-blue" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#5a8ab8" />
        </marker>
        <marker id="ml-arrow-orange" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#c8aa68" />
        </marker>
      </defs>

      {connections.map((conn, i) => {
        const from = getCenter(conn.from);
        const to = getCenter(conn.to);
        if (!from || !to) return null;

        const color = CONNECTION_COLORS[conn.label] || DEFAULT_CONNECTION_COLOR;
        const markerId = color === "#c8aa68" ? "ml-arrow-orange" : color === "#5a8ab8" ? "ml-arrow-blue" : "ml-arrow-green";
        const isDashed = conn.label === "提问延伸";
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        return (
          <g key={i}>
            <path
              d={`M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`}
              stroke={color}
              strokeWidth="1.8"
              strokeOpacity="0.7"
              fill="none"
              strokeDasharray={isDashed ? "6 3" : undefined}
              markerEnd={`url(#${markerId})`}
            />
            <rect
              x={midX - 28}
              y={midY - 10}
              width="56"
              height="18"
              rx="9"
              fill="white"
              stroke={color}
              strokeWidth="1"
              strokeOpacity="0.5"
            />
            <text
              x={midX}
              y={midY + 4}
              textAnchor="middle"
              fill={color}
              fontSize="10"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              fontWeight="600"
            >
              {conn.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
