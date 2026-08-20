"use client";

import { useState } from "react";
import type { AnswerAiMessageDto } from "@/lib/practice/types";

interface AskThreadProps {
  sessionId: string;
  answerRecordId: string;
  initialMessages: AnswerAiMessageDto[];
}

export function AskThread({ sessionId, answerRecordId, initialMessages }: AskThreadProps) {
  const [messages, setMessages] = useState<AnswerAiMessageDto[]>(initialMessages);
  const [opened, setOpened] = useState(initialMessages.length > 0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const q = input.trim();
    if (!q) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answerRecordId, question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "提问失败");
        return;
      }
      setMessages((prev) => [...prev, data]);
      setInput("");
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSending(false);
    }
  }

  if (!opened) {
    return (
      <div className="mt-3.5">
        <button
          onClick={() => setOpened(true)}
          className="inline-flex items-center gap-2 px-[18px] py-2.5 rounded-md bg-[rgba(111,141,181,0.12)] text-[#6f8db5] font-bold text-[13px] border border-[rgba(111,141,181,0.25)] hover:-translate-y-px transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.5 8.5 0 01-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1121 11.5z" />
          </svg>
          对这道题有不懂的点？问问 AI
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3.5 flex flex-col gap-3">
      {messages.map((m) => (
        <div key={m.id} className="flex flex-col gap-3">
          <div className="self-end max-w-[78%] bg-gradient-to-br from-primary to-primary-dark text-white px-4 py-2.5 rounded-[16px_16px_4px_16px] text-[13.5px] shadow-sm">
            {m.question}
          </div>
          <div className="self-start max-w-[88%] bg-white border border-border px-[17px] py-3.5 rounded-[16px_16px_16px_4px] shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#6f8db5] mb-1.5">
              <span className="w-5 h-5 rounded-md bg-gradient-to-br from-[#6f8db5] to-[#4d6fa0] grid place-items-center">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
                </svg>
              </span>
              AI 解答
            </div>
            <p className="text-[13.5px] text-text-secondary leading-[1.66] whitespace-pre-wrap">
              {m.answer}
            </p>
          </div>
        </div>
      ))}
      <div className="flex gap-2.5 mt-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !sending) send();
          }}
          placeholder={messages.length ? "继续追问…" : "输入你的问题，例如：为什么不能选 C？"}
          disabled={sending}
          className="flex-1 px-4 py-2.5 rounded-md border-[1.5px] border-border bg-white text-[13px] outline-none focus:border-primary disabled:opacity-60"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="px-4 rounded-md bg-primary-dark text-white grid place-items-center disabled:opacity-50"
        >
          {sending ? (
            <span className="text-[12px]">…</span>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </div>
      {error && <div className="text-[12px] text-[#a83c3c]">{error}</div>}
    </div>
  );
}
