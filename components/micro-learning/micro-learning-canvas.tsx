"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { LearningCard } from "./learning-card";
import { CardConnections, type SimpleConnection } from "./card-connections";
import { SelectionPopup } from "./selection-popup";
import type { CardType, ExampleAnalysis, ExtendedCard, SavedCardPosition } from "@/types/micro-learning";

interface CardPosition {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MicroLearningCanvasProps {
  recordId: string;
  detailedExplanation: string;
  knowledgePointName: string;
  exampleAnalyses: ExampleAnalysis[];
  extendedCards: ExtendedCard[];
  savedPositions?: SavedCardPosition[] | null;
  onAddExtendedCard: (card: ExtendedCard) => void;
  onRetryExample: (questionId: string, newAnalysis: string) => void;
}

const DETAIL_X = 60;
const DETAIL_Y = 40;
const DETAIL_W = 320;
const DETAIL_H = 360;
const EXAMPLE_W = 280;
const EXAMPLE_H = 260;
const EXAMPLE_GAP_Y = 60;
const COL_GAP_X = 100;
const EXTENDED_W = 280;
const EXTENDED_H = 200;

function detailCardId(recordId: string) {
  return `detail-${recordId}`;
}

function exampleCardId(questionId: string) {
  return `example-${questionId}`;
}

function computePositions(
  recordId: string,
  examples: ExampleAnalysis[],
  extended: ExtendedCard[]
): CardPosition[] {
  const positions: CardPosition[] = [];

  positions.push({
    id: detailCardId(recordId),
    type: "detail",
    x: DETAIL_X,
    y: DETAIL_Y,
    width: DETAIL_W,
    height: DETAIL_H,
  });

  const sorted = [...examples].sort((a, b) => Number(b.isWrong ?? false) - Number(a.isWrong ?? false));
  const exampleX = DETAIL_X + DETAIL_W + COL_GAP_X;
  sorted.forEach((ex, i) => {
    positions.push({
      id: exampleCardId(ex.questionId),
      type: "example",
      x: exampleX,
      y: DETAIL_Y + i * (EXAMPLE_H + EXAMPLE_GAP_Y),
      width: EXAMPLE_W,
      height: EXAMPLE_H,
    });
  });

  const extX = exampleX + EXAMPLE_W + COL_GAP_X;
  extended.forEach((ec, i) => {
    positions.push({
      id: ec.id,
      type: "extended",
      x: extX,
      y: DETAIL_Y + i * (EXTENDED_H + EXAMPLE_GAP_Y),
      width: EXTENDED_W,
      height: EXTENDED_H,
    });
  });

  return positions;
}

function buildConnections(
  recordId: string,
  examples: ExampleAnalysis[],
  extended: ExtendedCard[]
): SimpleConnection[] {
  const connections: SimpleConnection[] = [];
  const detail = detailCardId(recordId);

  examples.forEach((ex) => {
    connections.push({ from: detail, to: exampleCardId(ex.questionId), kind: "apply" });
  });

  extended.forEach((ec) => {
    connections.push({ from: ec.sourceCardId, to: ec.id, kind: "extend" });
  });

  return connections;
}

export function MicroLearningCanvas({
  recordId,
  detailedExplanation,
  knowledgePointName,
  exampleAnalyses,
  extendedCards,
  savedPositions,
  onAddExtendedCard,
  onRetryExample,
}: MicroLearningCanvasProps) {
  const [positions, setPositions] = useState<CardPosition[]>(() => {
    const computed = computePositions(recordId, exampleAnalyses, extendedCards);
    if (!savedPositions || savedPositions.length === 0) return computed;
    return computed.map((c) => {
      const saved = savedPositions.find((s) => s.id === c.id);
      return saved ? { ...c, x: saved.x, y: saved.y } : c;
    });
  });

  const exampleSig = useMemo(
    () => exampleAnalyses.map((e) => e.questionId).join(","),
    [exampleAnalyses]
  );
  const extendedSig = useMemo(
    () => extendedCards.map((e) => e.id).join(","),
    [extendedCards]
  );

  useEffect(() => {
    setPositions((prev) => {
      const computed = computePositions(recordId, exampleAnalyses, extendedCards);
      const merged = computed.map((c) => {
        const existing = prev.find((p) => p.id === c.id);
        return existing ? { ...c, x: existing.x, y: existing.y } : c;
      });
      return merged;
    });
  }, [recordId, exampleSig, extendedSig, exampleAnalyses, extendedCards]);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialMountRef = useRef(true);

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const payload: SavedCardPosition[] = positions.map((p) => ({ id: p.id, x: p.x, y: p.y }));
      fetch(`/api/micro-learning/${recordId}/layout`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: payload }),
      }).catch((err) => console.error("[micro-learning] save layout failed", err));
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [positions, recordId]);

  const connections = useMemo(
    () => buildConnections(recordId, exampleAnalyses, extendedCards),
    [recordId, exampleAnalyses, extendedCards]
  );

  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const dragRef = useRef<{ cardId: string; offsetX: number; offsetY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [selPopup, setSelPopup] = useState({
    visible: false,
    x: 0,
    y: 0,
    text: "",
    cardId: "",
    cardContent: "",
  });
  const [askLoading, setAskLoading] = useState(false);
  const [retryingMap, setRetryingMap] = useState<Record<string, boolean>>({});

  const handleDragStart = useCallback(
    (cardId: string, e: React.PointerEvent) => {
      const pos = positions.find((p) => p.id === cardId);
      if (!pos) return;
      const worldEl = viewportRef.current?.firstElementChild as HTMLElement;
      if (!worldEl) return;
      const worldRect = worldEl.getBoundingClientRect();
      dragRef.current = {
        cardId,
        offsetX: (e.clientX - worldRect.left) / scale - pos.x,
        offsetY: (e.clientY - worldRect.top) / scale - pos.y,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [positions, scale]
  );

  const handleViewportPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) return;
      if ((e.target as HTMLElement).closest("[data-card-id]")) return;
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panOffset.x,
        panY: panOffset.y,
      };
    },
    [panOffset]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        const worldEl = viewportRef.current?.firstElementChild as HTMLElement;
        if (!worldEl) return;
        const worldRect = worldEl.getBoundingClientRect();
        const { cardId, offsetX, offsetY } = dragRef.current;
        const newX = (e.clientX - worldRect.left) / scale - offsetX;
        const newY = (e.clientY - worldRect.top) / scale - offsetY;
        setPositions((prev) =>
          prev.map((p) => (p.id === cardId ? { ...p, x: newX, y: newY } : p))
        );
      } else if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPanOffset({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      }
    },
    [isPanning, scale]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Math.min(2, Math.max(0.3, s + delta)));
  }, []);

  const zoomIn = () => setScale((s) => Math.min(2, s + 0.12));
  const zoomOut = () => setScale((s) => Math.max(0.3, s - 0.12));

  const handleTextSelect = useCallback(
    (cardId: string, text: string, rect: DOMRect, cardContent: string) => {
      if (rect.width === 0 && rect.height === 0) return;
      setSelPopup({
        visible: true,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
        text,
        cardId,
        cardContent,
      });
    },
    []
  );

  const handleAsk = useCallback(async () => {
    if (askLoading) return;
    setAskLoading(true);
    try {
      const res = await fetch(`/api/micro-learning/${recordId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText: selPopup.text,
          sourceCardId: selPopup.cardId,
          sourceCardContent: selPopup.cardContent,
        }),
      });
      if (!res.ok) {
        console.error("[micro-learning] ask failed", await res.text());
        return;
      }
      const data = await res.json();
      if (data.card) {
        onAddExtendedCard(data.card as ExtendedCard);
      }
    } finally {
      setAskLoading(false);
      setSelPopup((s) => ({ ...s, visible: false }));
    }
  }, [askLoading, recordId, selPopup, onAddExtendedCard]);

  const handleClosePopup = useCallback(() => {
    if (!askLoading) setSelPopup((s) => ({ ...s, visible: false }));
  }, [askLoading]);

  const handleViewportClick = useCallback(
    (e: React.MouseEvent) => {
      if (selPopup.visible && !askLoading) {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-card-id]")) {
          setSelPopup((s) => ({ ...s, visible: false }));
        }
      }
    },
    [selPopup.visible, askLoading]
  );

  const handleRetry = useCallback(
    async (questionId: string) => {
      if (retryingMap[questionId]) return;
      setRetryingMap((m) => ({ ...m, [questionId]: true }));
      try {
        const res = await fetch(`/api/micro-learning/${recordId}/retry-example`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId }),
        });
        if (!res.ok) {
          console.error("[micro-learning] retry failed", await res.text());
          return;
        }
        const data = await res.json();
        if (data.example?.analysis) {
          onRetryExample(questionId, data.example.analysis);
        }
      } finally {
        setRetryingMap((m) => ({ ...m, [questionId]: false }));
      }
    },
    [recordId, retryingMap, onRetryExample]
  );

  const detailId = detailCardId(recordId);

  return (
    <>
      <div
        ref={viewportRef}
        className={`flex-1 relative overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          backgroundColor: "#f4f2f0",
          backgroundImage: "radial-gradient(circle, rgba(159,185,151,0.3) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onClick={handleViewportClick}
      >
        <div
          className="absolute w-[2400px] h-[1600px]"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <CardConnections connections={connections} cardPositions={positions} />

          {(() => {
            const pos = positions.find((p) => p.id === detailId);
            if (!pos) return null;
            return (
              <LearningCard
                key={detailId}
                id={detailId}
                type="detail"
                title={knowledgePointName}
                content={detailedExplanation}
                x={pos.x}
                y={pos.y}
                onDragStart={handleDragStart}
                onTextSelect={handleTextSelect}
              />
            );
          })()}

          {exampleAnalyses.map((ex) => {
            const id = exampleCardId(ex.questionId);
            const pos = positions.find((p) => p.id === id);
            if (!pos) return null;
            return (
              <LearningCard
                key={id}
                id={id}
                type="example"
                title={ex.content}
                content={ex.analysis}
                questionId={ex.questionId}
                questionMeta={{
                  options: ex.options,
                  answer: ex.answer,
                  userAnswer: ex.userAnswer,
                  isWrong: ex.isWrong,
                }}
                x={pos.x}
                y={pos.y}
                onDragStart={handleDragStart}
                onTextSelect={handleTextSelect}
                onRetryExample={handleRetry}
                retrying={!!retryingMap[ex.questionId]}
              />
            );
          })}

          {extendedCards.map((ec) => {
            const pos = positions.find((p) => p.id === ec.id);
            if (!pos) return null;
            return (
              <LearningCard
                key={ec.id}
                id={ec.id}
                type="extended"
                title={ec.title}
                content={ec.content}
                sourceKeyword={ec.sourceKeyword}
                x={pos.x}
                y={pos.y}
                onDragStart={handleDragStart}
                onTextSelect={handleTextSelect}
              />
            );
          })}
        </div>

        <div className="absolute bottom-5 right-5 z-20 flex flex-col gap-1">
          <button onClick={zoomIn} className="w-[30px] h-[30px] rounded-lg bg-white border border-border flex items-center justify-center text-[16px] font-bold text-text-secondary shadow-sm hover:bg-background-alt hover:text-foreground transition-all">
            +
          </button>
          <div className="text-center text-[10.5px] text-text-muted bg-white border border-border rounded-md px-1 py-0.5">
            {Math.round(scale * 100)}%
          </div>
          <button onClick={zoomOut} className="w-[30px] h-[30px] rounded-lg bg-white border border-border flex items-center justify-center text-[16px] font-bold text-text-secondary shadow-sm hover:bg-background-alt hover:text-foreground transition-all">
            −
          </button>
        </div>
      </div>

      <SelectionPopup
        visible={selPopup.visible}
        x={selPopup.x}
        y={selPopup.y}
        selectedText={selPopup.text}
        loading={askLoading}
        onConfirm={handleAsk}
        onClose={handleClosePopup}
      />
    </>
  );
}
