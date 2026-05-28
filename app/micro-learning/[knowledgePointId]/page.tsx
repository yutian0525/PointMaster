"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toolbar } from "@/components/micro-learning/toolbar";
import { MicroLearningCanvas } from "@/components/micro-learning/micro-learning-canvas";
import { LoadingSkeleton } from "@/components/micro-learning/loading-skeleton";
import { HistoryDrawer } from "@/components/micro-learning/history-drawer";
import type { MicroCard, CardConnection, GenerateRequest } from "@/types";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [knowledgePointName, setKnowledgePointName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [context, setContext] = useState<GenerateRequest["context"] | undefined>(undefined);

  // Generate cards on mount
  useEffect(() => {
    async function generate() {
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

    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledgePointId]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      const extendedCards = cards.filter((c) => c.type === "extended");
      await fetch("/api/micro-learning/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgePointId,
          cards: cards.filter((c) => c.type !== "extended"),
          connections,
          extendedCards,
          context: context || null,
        }),
      });
      const bankId = searchParams.get("bankId");
      router.push(bankId ? `/banks/${bankId}` : "/banks");
    } finally {
      setCompleting(false);
    }
  }, [cards, connections, context, knowledgePointId, router, searchParams]);

  const handleLoadRecord = useCallback(async (recordId: string) => {
    setHistoryOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/micro-learning/history/${recordId}`);
      const data = await res.json();
      setCards([...(data.cards || []), ...(data.extendedCards || [])]);
      setConnections(data.connections || []);
    } finally {
      setLoading(false);
    }
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
      />
      <MicroLearningCanvas
        cards={cards}
        connections={connections}
        knowledgePointId={knowledgePointId}
        onCardsChange={setCards}
        onConnectionsChange={setConnections}
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
