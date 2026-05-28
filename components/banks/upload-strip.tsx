"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function UploadStrip() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleFileSelect(file: File) {
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/banks", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "上传失败");
        return;
      }

      // Trigger processing
      await fetch(`/api/banks/${data.id}/process`, { method: "POST" });

      // Navigate to detail page
      router.push(`/banks/${data.id}`);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="flex items-center gap-4 border-[1.5px] border-dashed border-border-strong rounded-lg p-[18px] cursor-pointer bg-[rgba(200,212,192,0.04)] hover:border-primary hover:bg-[rgba(159,185,151,0.07)] transition-all"
      onClick={() => fileInputRef.current?.click()}
    >
      <div className="w-[42px] h-[42px] rounded-xl flex-shrink-0 bg-gradient-to-br from-primary-light to-background border border-border-strong flex items-center justify-center">
        <svg className="w-[19px] h-[19px] text-primary-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17,8 12,3 7,8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div className="flex-1">
        <div className="text-[13.5px] font-semibold text-foreground mb-0.5">
          {uploading ? "正在上传..." : "导入新题库"}
        </div>
        <div className="text-[12px] text-text-muted">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : (
            "支持 Excel、JSON、TXT 格式 — AI 自动提取知识点并构建知识图谱"
          )}
        </div>
      </div>
      <button
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-[9px] bg-gradient-to-br from-primary to-primary-dark text-white text-[13px] font-semibold shadow-sm hover:shadow-md hover:-translate-y-px transition-all"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        disabled={uploading}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        选择文件
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.json,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
