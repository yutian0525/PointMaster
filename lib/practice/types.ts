export type SessionMode = "normal" | "redo" | "wrong-redo";
export type SessionStatus = "active" | "completed" | "abandoned";
export type QuestionTypeName = "单选题" | "多选题" | "判断题";

export interface OrderedKnowledgePoint {
  id: string;
  name: string;
  order: number;
  reason: string;
  totalQuestions: number;
}

export interface PlanPreviewResponse {
  orderedKnowledgePoints: OrderedKnowledgePoint[];
  planningNote: string;
}

export interface MasteryState {
  mastery: number;
  confidence: number;
  streak: number;
  testedCount: number;
  correctCount: number;
}

export interface MasteryUpdateInput {
  prev: MasteryState;
  score: 0 | 1;
  difficulty: number | null;
  answerTime: number;
  expectedTime: number | null;
}

export interface QuizQuestion {
  id: string;
  content: string;
  options: string[];
  questionType: QuestionTypeName;
  difficulty: number;
  expectedTime: number;
}

export interface SubmittedQuestionInfo {
  score: 0 | 1;
  correctAnswer: string;
  analysis: string;
  answerRecordId: string;
  aiMessages: AnswerAiMessageDto[];
}

export interface AnswerAiMessageDto {
  id: string;
  question: string;
  answer: string;
  createdAt: number;
}

export interface QuizCurrentQuestion extends QuizQuestion {
  submitted?: SubmittedQuestionInfo;
}

export interface QuizKpItem {
  id: string;
  name: string;
  order: number;
  totalQuestions: number;
  answeredCount: number;
  correctRate: number;
  mastery: number;
  status: "done" | "current" | "todo";
}

export interface QuizPayload {
  session: {
    id: string;
    status: SessionStatus;
    bankId: string;
    bankName: string;
    currentKpIndex: number;
    currentMode: SessionMode;
    currentRoundIndex: number;
  };
  knowledgePoints: QuizKpItem[];
  currentKp: { id: string; name: string } | null;
  currentQuestion: QuizCurrentQuestion | null;
  mastery: MasteryState;
  overview: Array<{ kpId: string; name: string; mastery: number }>;
}

export interface SelectorContext {
  sessionId: string;
  bankId: string;
  kpId: string;
  mode: SessionMode;
  roundIndex: number;
}

export interface SubmitAnswerResponse {
  score: 0 | 1;
  correctAnswer: string;
  analysis: string;
  mastery: MasteryState;
  kpProgress: { answeredCount: number; correctRate: number };
  answerRecordId: string;
}

export interface AdvanceAction {
  action: "redo" | "wrong-redo" | "next-kp" | "skip";
}
