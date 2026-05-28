"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toolbar } from "@/components/micro-learning/toolbar";
import { MicroLearningCanvas } from "@/components/micro-learning/micro-learning-canvas";
import { LoadingSkeleton } from "@/components/micro-learning/loading-skeleton";
import { HistoryDrawer } from "@/components/micro-learning/history-drawer";
import type { MicroCard, CardConnection, GenerateRequest, CardType } from "@/types";

interface CardPosition {
  id: string;
  type: CardType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function MicroLearningPage({
  params,
}: {
  params: Promise<{ knowledgePointId: string }>;
}) {
  const { knowledgePointId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [cards, setCards] = useState<MicroCard[]>([]);
  const [connections, setConnections] = useState<CardConnection[]>([]);
  const [positions, setPositions] = useState<CardPosition[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [knowledgePointName, setKnowledgePointName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saved, setSaved] = useState<boolean | undefined>(undefined);
  const [context, setContext] = useState<GenerateRequest["context"] | undefined>(undefined);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordIdRef = useRef<string | null>(null);

  // Load existing record or generate new cards
  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);

      try {
        const bankId = searchParams.get("bankId");
        if (bankId) {
          const graphRes = await fetch(`/api/banks/${bankId}/graph`);
          if (graphRes.ok) {
            const graphData = await graphRes.json();
            const kp = graphData.nodes?.find((n: { id: string; name: string }) => n.id === knowledgePointId);
            if (kp) setKnowledgePointName(kp.name);
          }
        }

        // Check for existing saved record first
        const historyRes = await fetch(`/api/micro-learning/history?knowledgePointId=${knowledgePointId}`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          const latestRecord = historyData.records?.[0];
          if (latestRecord) {
            const detailRes = await fetch(`/api/micro-learning/history/${latestRecord.id}`);
            if (detailRes.ok) {
              const detail = await detailRes.json();
              setCards([...(detail.cards || []), ...(detail.extendedCards || [])]);
              setConnections(detail.connections || []);
              if (detail.positions) setPositions(detail.positions);
              recordIdRef.current = latestRecord.id;
              setSaved(true);
              setLoading(false);
              return;
            }
          }
        }

        // No existing record — generate via AI
        const body: GenerateRequest = { knowledgePointId, context };
        const res = await fetch("/api/micro-learning/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error("生成失败，请重试");
        }

        const data = await res.json();
        setCards(data.cards || []);
        setConnections(data.connections || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "未知错误");
      } finally {
        setLoading(false);
      }
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledgePointId]);

  // Auto-save: debounced save when cards/connections/positions change
  const doAutoSave = useCallback(async () => {
    if (cards.length === 0) return;
    setSaved(false);
    try {
      const extendedCards = cards.filter((c) => c.type === "extended");
      const res = await fetch("/api/micro-learning/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgePointId,
          cards: cards.filter((c) => c.type !== "extended"),
          connections,
          extendedCards,
          positions,
          context: context || null,
          recordId: recordIdRef.current,
        }),
      });
      const data = await res.json();
      if (data.id) {
        recordIdRef.current = data.id;
      }
      setSaved(true);
    } catch {
      setSaved(undefined);
    }
  }, [cards, connections, positions, context, knowledgePointId]);

  // Trigger auto-save on card/connection/position changes (debounced 3s)
  useEffect(() => {
    if (loading || cards.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      doAutoSave();
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [cards, connections, positions, loading, doAutoSave]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      await doAutoSave();
      const bankId = searchParams.get("bankId");
      router.push(bankId ? `/banks/${bankId}` : "/banks");
    } finally {
      setCompleting(false);
    }
  }, [doAutoSave, router, searchParams]);

  const handleLoadRecord = useCallback(async (recordId: string) => {
    setHistoryOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/micro-learning/history/${recordId}`);
      const data = await res.json();
      setCards([...(data.cards || []), ...(data.extendedCards || [])]);
      setConnections(data.connections || []);
      if (data.positions) {
        setPositions(data.positions);
      }
      recordIdRef.current = recordId;
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePositionsChange = useCallback((newPositions: CardPosition[]) => {
    setPositions(newPositions);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Toolbar
          knowledgePointName={knowledgePointName || "加载中…"}
          cardCount={0}
          onOpenHistory={() => {}}
          onComplete={() => {}}
          completing={false}
        />
        <LoadingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <Toolbar
          knowledgePointName={knowledgePointName || "微学习"}
          cardCount={0}
          onOpenHistory={() => setHistoryOpen(true)}
          onComplete={() => {}}
          completing={false}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-[15px] text-text-secondary mb-3">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[13px] font-semibold"
            >
              重试
            </button>
          </div>
        </div>
        <HistoryDrawer
          open={historyOpen}
          knowledgePointId={knowledgePointId}
          onClose={() => setHistoryOpen(false)}
          onLoadRecord={handleLoadRecord}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        knowledgePointName={knowledgePointName}
        cardCount={cards.length}
        onOpenHistory={() => setHistoryOpen(true)}
        onComplete={handleComplete}
        completing={completing}
        saved={saved}
      />
      <MicroLearningCanvas
        cards={cards}
        connections={connections}
        knowledgePointId={knowledgePointId}
        onCardsChange={setCards}
        onConnectionsChange={setConnections}
        onPositionsChange={handlePositionsChange}
        savedPositions={positions}
      />
      <HistoryDrawer
        open={historyOpen}
        knowledgePointId={knowledgePointId}
        onClose={() => setHistoryOpen(false)}
        onLoadRecord={handleLoadRecord}
      />
    </div>
  );
}
