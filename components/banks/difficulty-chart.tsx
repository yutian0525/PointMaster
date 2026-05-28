"use client";

import { useEffect, useState } from "react";

interface DifficultyBucket {
  range: string;
  count: number;
}

const LABELS: Record<string, string> = {
  "0.0-0.2": "极易",
  "0.2-0.4": "简单",
  "0.4-0.6": "中等",
  "0.6-0.8": "较难",
  "0.8-1.0": "困难",
  未标注: "未标注",
};

const BAR_COLORS: Record<string, string> = {
  "0.0-0.2": "#9fb997",
  "0.2-0.4": "#7bad70",
  "0.4-0.6": "#e6b450",
  "0.6-0.8": "#e68a50",
  "0.8-1.0": "#c85a5a",
  未标注: "#c0bab4",
};

interface DifficultyChartProps {
  bankId: string;
}

export function DifficultyChart({ bankId }: DifficultyChartProps) {
  const [data, setData] = useState<DifficultyBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/banks/${bankId}/difficulty-distribution`);
        if (res.ok) {
          const json = await res.json();
          setData(json.distribution || []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [bankId]);

  if (loading) {
    return null;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return null;
  }

  return (
    <div className="flex flex-col justify-between">
      <div className="text-[12.5px] text-text-muted">难度分布</div>
      <div className="flex items-end gap-1.5 mt-1">
        {data.map((bucket) => {
          const heightPct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
          return (
            <div
              key={bucket.range}
              className="flex-1 flex flex-col items-center"
            >
              <div
                className="w-full flex items-end justify-center"
                style={{ height: "48px" }}
              >
                <div
                  className="w-full max-w-[20px] rounded-t-sm"
                  style={{
                    height: `${Math.max(heightPct, bucket.count > 0 ? 6 : 0)}%`,
                    backgroundColor: BAR_COLORS[bucket.range] || "#c0bab4",
                  }}
                />
              </div>
              <div className="text-[8.5px] text-text-muted text-center mt-0.5 leading-none">
                {LABELS[bucket.range] || bucket.range}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
