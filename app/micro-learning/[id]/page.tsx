"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { MicroLearningCanvas } from "@/components/micro-learning/micro-learning-canvas";
import { Toolbar } from "@/components/micro-learning/toolbar";
import type {
  ExampleAnalysis,
  ExtendedCard,
  MicroLearningRecord,
} from "@/types/micro-learning";

export default function MicroLearningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const search = useSearchParams();
  const returnTo = search.get("returnTo");

  const [record, setRecord] = useState<MicroLearningRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/micro-learning/${id}`);
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? "记录不存在" : "加载失败");
          return;
        }
        const data: MicroLearningRecord = await res.json();
        if (!cancelled) setRecord(data);
      } catch (err) {
        console.error("[micro-learning detail] load failed", err);
        if (!cancelled) setError("加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAddExtendedCard = useCallback((card: ExtendedCard) => {
    setRecord((prev) =>
      prev ? { ...prev, extendedCards: [...prev.extendedCards, card] } : prev
    );
  }, []);

  const handleRetryExample = useCallback((questionId: string, newAnalysis: string) => {
    setRecord((prev) => {
      if (!prev) return prev;
      const updated: ExampleAnalysis[] = prev.exampleAnalyses.map((ex) =>
        ex.questionId === questionId ? { ...ex, analysis: newAnalysis } : ex
      );
      return { ...prev, exampleAnalyses: updated };
    });
  }, []);

  const handleFinish = useCallback(() => {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (record) {
      router.push(`/banks/${record.bankId}`);
      return;
    }
    router.push("/");
  }, [returnTo, record, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-text-secondary text-[14px]">{error}</div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-primary-dark" size={24} />
          <div className="text-[12.5px] text-text-muted">加载中…</div>
        </div>
      </div>
    );
  }

  const cardCount = 1 + record.exampleAnalyses.length + record.extendedCards.length;

  return (
    <div className="h-screen flex flex-col bg-background">
      <Toolbar
        knowledgePointName={record.knowledgePointName}
        cardCount={cardCount}
        finishLabel={returnTo ? "学完了，继续练习" : "完成学习"}
        onFinish={handleFinish}
      />
      <MicroLearningCanvas
        recordId={record.id}
        detailedExplanation={record.detailedExplanation}
        knowledgePointName={record.knowledgePointName}
        exampleAnalyses={record.exampleAnalyses}
        extendedCards={record.extendedCards}
        savedPositions={record.cardPositions}
        onAddExtendedCard={handleAddExtendedCard}
        onRetryExample={handleRetryExample}
      />
    </div>
  );
}
