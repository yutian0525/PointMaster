"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { LearningCard } from "./learning-card";
import { CardConnections } from "./card-connections";
import { SelectionPopup } from "./selection-popup";
import type { MicroCard, CardConnection, CardType } from "@/types";

interface CardPosition {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MicroLearningCanvasProps {
  cards: MicroCard[];
  connections: CardConnection[];
  knowledgePointId: string;
  onCardsChange: (cards: MicroCard[]) => void;
  onConnectionsChange: (connections: CardConnection[]) => void;
  onPositionsChange?: (positions: CardPosition[]) => void;
  savedPositions?: CardPosition[] | null;
}

function computeInitialPositions(cards: MicroCard[]): CardPosition[] {
  const CARD_W = 280;
  const CARD_H = 220;
  const GAP_X = 80;
  const GAP_Y = 60;
  const START_X = 60;
  const START_Y = 40;

  const positions: CardPosition[] = [];

  const col1Types: CardType[] = ["concept", "signal", "template"];
  const col2Types: CardType[] = ["pitfall", "example"];
  const extCards = cards.filter((c) => c.type === "extended");

  let col1Y = START_Y;
  let col2Y = START_Y;

  for (const card of cards) {
    if (col1Types.includes(card.type)) {
      positions.push({ id: card.id, type: card.type, x: START_X, y: col1Y, width: CARD_W, height: CARD_H });
      col1Y += CARD_H + GAP_Y;
    } else if (col2Types.includes(card.type)) {
      positions.push({ id: card.id, type: card.type, x: START_X + CARD_W + GAP_X, y: col2Y, width: CARD_W, height: CARD_H });
      col2Y += CARD_H + GAP_Y;
    }
  }

  const extX = START_X + (CARD_W + GAP_X) * 2;
  let extY = START_Y;
  for (const card of extCards) {
    positions.push({ id: card.id, type: card.type, x: extX, y: extY, width: CARD_W, height: CARD_H });
    extY += CARD_H + GAP_Y;
  }

  return positions;
}

export function MicroLearningCanvas({
  cards,
  connections,
  knowledgePointId,
  onCardsChange,
  onConnectionsChange,
  onPositionsChange,
  savedPositions,
}: MicroLearningCanvasProps) {
  const [positions, setPositions] = useState<CardPosition[]>(() => {
    if (savedPositions && savedPositions.length > 0) return savedPositions;
    return computeInitialPositions(cards);
  });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const dragRef = useRef<{ cardId: string; offsetX: number; offsetY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Selection popup state
  const [selPopup, setSelPopup] = useState({
    visible: false, x: 0, y: 0, text: "", cardId: "", cardContent: "",
  });
  const [askLoading, setAskLoading] = useState(false);

  // Re-layout when cards array fully resets (generation complete)
  const prevCardCountRef = useRef(cards.length);
  useEffect(() => {
    if (cards.length > 0 && prevCardCountRef.current === 0) {
      if (!savedPositions || savedPositions.length === 0) {
        setPositions(computeInitialPositions(cards));
      }
    }
    prevCardCountRef.current = cards.length;
  }, [cards, savedPositions]);

  // Add positions for new cards (extended cards added after ask)
  useEffect(() => {
    setPositions((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const newCards = cards.filter((c) => !existingIds.has(c.id));
      if (newCards.length === 0) return prev;

      const maxX = Math.max(...prev.map((p) => p.x + p.width), 0);
      const newPositions = newCards.map((card, i) => ({
        id: card.id,
        type: card.type,
        x: maxX + 80,
        y: 40 + i * 280,
        width: 280,
        height: 220,
      }));

      return [...prev, ...newPositions];
    });
  }, [cards]);

  // Notify parent of position changes (separate effect to avoid setState-during-render)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    onPositionsChange?.(positions);
  }, [positions, onPositionsChange]);

  // Drag handlers
  const handleDragStart = useCallback((cardId: string, e: React.PointerEvent) => {
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
  }, [positions, scale]);

  const handleViewportPointerDown = useCallback((e: React.PointerEvent) => {
    if (dragRef.current) return;
    if ((e.target as HTMLElement).closest("[data-card-id]")) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
  }, [panOffset]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
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
  }, [isPanning, scale]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Math.min(2, Math.max(0.3, s + delta)));
  }, []);

  const zoomIn = () => setScale((s) => Math.min(2, s + 0.12));
  const zoomOut = () => setScale((s) => Math.max(0.3, s - 0.12));

  // Text selection — improved to handle multi-line selections
  const handleTextSelect = useCallback((cardId: string, text: string, rect: DOMRect, cardContent: string) => {
    if (rect.width === 0 && rect.height === 0) return;
    setSelPopup({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
      text,
      cardId,
      cardContent,
    });
  }, []);

  // Card-level ask button
  const handleAskCard = useCallback((cardId: string, cardContent: string) => {
    const card = cards.find((c) => c.id === cardId);
    const cardEl = viewportRef.current?.querySelector(`[data-card-id="${cardId}"]`);
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    setSelPopup({
      visible: true,
      x: rect.right + 8,
      y: rect.top,
      text: card?.title || "",
      cardId,
      cardContent,
    });
  }, [cards]);

  const handleAsk = useCallback(async (question: string) => {
    if (askLoading) return;
    setAskLoading(true);

    try {
      const res = await fetch("/api/micro-learning/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgePointId,
          selectedText: question,
          sourceCardId: selPopup.cardId,
          sourceCardContent: selPopup.cardContent,
        }),
      });
      const data = await res.json();

      if (data.card) {
        onCardsChange([...cards, data.card]);
        onConnectionsChange([...connections, data.connection]);
      }
    } finally {
      setAskLoading(false);
      setSelPopup((s) => ({ ...s, visible: false }));
    }
  }, [askLoading, knowledgePointId, selPopup, cards, connections, onCardsChange, onConnectionsChange]);

  const handleClosePopup = useCallback(() => {
    if (!askLoading) {
      setSelPopup((s) => ({ ...s, visible: false }));
    }
  }, [askLoading]);

  // Dismiss popup on viewport click (but not on card or popup click)
  const handleViewportClick = useCallback((e: React.MouseEvent) => {
    if (selPopup.visible && !askLoading) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-card-id]")) {
        setSelPopup((s) => ({ ...s, visible: false }));
      }
    }
  }, [selPopup.visible, askLoading]);

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

          {cards.map((card) => {
            const pos = positions.find((p) => p.id === card.id);
            if (!pos) return null;
            return (
              <LearningCard
                key={card.id}
                id={card.id}
                type={card.type}
                title={card.title}
                content={card.content}
                importance={card.importance}
                sourceKeyword={card.sourceKeyword}
                x={pos.x}
                y={pos.y}
                onDragStart={handleDragStart}
                onTextSelect={handleTextSelect}
                onAskCard={handleAskCard}
              />
            );
          })}
        </div>

        {/* Zoom controls */}
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
        onAsk={handleAsk}
        onClose={handleClosePopup}
      />
    </>
  );
}
