"use client";

import { useEffect, useRef } from "react";
import { KpPill } from "./kp-pill";
import type { QuizKpItem } from "@/lib/practice/types";

export function KpStrip({ kps }: { kps: QuizKpItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const cur = track.querySelector<HTMLElement>("[data-current]");
    if (cur) {
      cur.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [kps]);

  return (
    <div className="px-[30px] py-[5px] border-b border-border bg-white/50 backdrop-blur-sm">
      <div ref={trackRef} className="flex gap-[7px] overflow-x-auto pb-px scrollbar-thin">
        {kps.map((kp) => (
          <KpPill key={kp.id} kp={kp} />
        ))}
      </div>
    </div>
  );
}
