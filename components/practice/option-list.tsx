"use client";

import type { QuestionTypeName, SubmittedQuestionInfo } from "@/lib/practice/types";

interface OptionListProps {
  options: string[];
  questionType: QuestionTypeName;
  selected: string;
  onChange: (next: string) => void;
  submitted?: SubmittedQuestionInfo;
  userAnswer: string;
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function isMulti(t: QuestionTypeName) {
  return t === "多选题";
}

function toggleLetter(current: string, letter: string): string {
  const set = new Set(current.split(""));
  if (set.has(letter)) set.delete(letter);
  else set.add(letter);
  return Array.from(set).sort().join("");
}

export function OptionList({
  options,
  questionType,
  selected,
  onChange,
  submitted,
  userAnswer,
}: OptionListProps) {
  const display = questionType === "判断题"
    ? ["对", "错"]
    : options;
  const letters = questionType === "判断题"
    ? ["A", "B"]
    : LETTERS.slice(0, options.length);

  return (
    <div className={`flex flex-col gap-2.5 ${submitted ? "pointer-events-none" : ""}`}>
      {display.map((text, i) => {
        const letter = letters[i];
        const isSelected =
          questionType === "判断题"
            ? selected === text || (userAnswer && (text === "对" ? userAnswer === "对" : userAnswer === "错"))
            : selected.includes(letter);

        let stateClass = "bg-white border-border";
        let keyClass = "bg-background-alt text-text-secondary";
        let verdictNode: React.ReactNode = null;

        if (submitted) {
          const correctSet = new Set(submitted.correctAnswer.split("").filter((c) => c >= "A" && c <= "Z"));
          const correctIsTrue = submitted.correctAnswer === "对";
          const correctIsFalse = submitted.correctAnswer === "错";
          const isCorrect =
            questionType === "判断题"
              ? (text === "对" && correctIsTrue) || (text === "错" && correctIsFalse)
              : correctSet.has(letter);
          const userPicked =
            questionType === "判断题"
              ? userAnswer === text
              : userAnswer.includes(letter);

          if (isCorrect) {
            stateClass = "border-primary-dark bg-[rgba(159,185,151,0.14)]";
            keyClass = "bg-primary-dark text-white";
            verdictNode = (
              <span className="ml-auto text-[12px] font-bold text-primary-dark inline-flex items-center gap-1">
                <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                正确答案
              </span>
            );
          } else if (userPicked) {
            stateClass = "border-[#c97878] bg-[rgba(201,120,120,0.13)]";
            keyClass = "bg-[#a83c3c] text-white";
            verdictNode = (
              <span className="ml-auto text-[12px] font-bold text-[#a83c3c] inline-flex items-center gap-1">
                <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                你的选择
              </span>
            );
          } else {
            stateClass = "bg-white border-border opacity-50";
          }
        } else if (isSelected) {
          stateClass = "border-primary bg-[rgba(159,185,151,0.1)]";
          keyClass = "bg-gradient-to-br from-primary to-primary-dark text-white";
        }

        return (
          <button
            key={`${i}-${letter}`}
            onClick={() => {
              if (submitted) return;
              if (questionType === "判断题") {
                onChange(text);
              } else if (isMulti(questionType)) {
                onChange(toggleLetter(selected, letter));
              } else {
                onChange(letter);
              }
            }}
            className={`flex items-center gap-[15px] px-[18px] py-4 rounded-md border-[1.5px] text-left w-full transition-all hover:border-border-strong ${stateClass}`}
          >
            <span
              className={`w-[30px] h-[30px] flex-shrink-0 rounded-[9px] grid place-items-center font-bold text-[14px] transition-all ${keyClass}`}
            >
              {questionType === "判断题" ? text : letter}
            </span>
            {questionType !== "判断题" && (
              <span className="text-[14.5px] text-foreground font-medium flex-1 min-w-0 break-words">
                {text}
              </span>
            )}
            {verdictNode}
          </button>
        );
      })}
    </div>
  );
}
