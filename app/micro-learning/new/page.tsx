"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function MicroLearningNewInner() {
  const router = useRouter();
  const search = useSearchParams();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const kpId = search.get("kpId");
    const sessionId = search.get("sessionId");
    const focusHint = search.get("focusHint");
    const returnTo = search.get("returnTo");

    if (!kpId) {
      router.replace("/");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/micro-learning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            knowledgePointId: kpId,
            sessionId: sessionId ?? undefined,
            focusHint: focusHint ?? undefined,
          }),
        });
        if (!res.ok) {
          console.error("[micro-learning new] create failed", await res.text());
          alert("微学习生成失败，请稍后重试。");
          router.back();
          return;
        }
        const data = await res.json();
        if (!data?.id) {
          alert("微学习生成失败：响应缺少 id。");
          router.back();
          return;
        }
        const target = returnTo
          ? `/micro-learning/${data.id}?returnTo=${encodeURIComponent(returnTo)}`
          : `/micro-learning/${data.id}`;
        router.replace(target);
      } catch (err) {
        console.error("[micro-learning new] error", err);
        alert("微学习生成失败，请检查网络。");
        router.back();
      }
    })();
  }, [router, search]);

  return null;
}

export default function MicroLearningNewPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-text-secondary">
        <Loader2 className="animate-spin text-primary-dark" size={28} />
        <div className="text-[14px] font-semibold text-foreground">AI 正在生成学习卡片…</div>
        <div className="text-[12px] text-text-muted">通常需要 6-12 秒，请稍候</div>
      </div>
      <Suspense fallback={null}>
        <MicroLearningNewInner />
      </Suspense>
    </div>
  );
}
