export type CardType = "detail" | "example" | "extended";

export interface ExampleAnalysis {
  questionId: string;
  content: string;
  options: string[];
  answer: string;
  userAnswer?: string;
  isWrong?: boolean;
  analysis: string;
}

export interface ExtendedCard {
  id: string;
  type: "extended";
  title: string;
  content: string;
  sourceCardId: string;
  sourceKeyword: string;
  createdAt: number;
}

export interface SavedCardPosition {
  id: string;
  x: number;
  y: number;
}

export interface MicroLearningRecord {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  bankId: string;
  sessionId: string | null;
  focusHint: string | null;
  detailedExplanation: string;
  exampleAnalyses: ExampleAnalysis[];
  extendedCards: ExtendedCard[];
  cardPositions: SavedCardPosition[] | null;
  sourceQuestionIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface MicroLearningListItem {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  sessionId: string | null;
  exampleCount: number;
  extendedCardCount: number;
  createdAt: number;
}

export interface MicroCard {
  id: string;
  type: CardType;
  title: string;
  content: string;
  questionId?: string;
  questionMeta?: {
    options: string[];
    answer: string;
    userAnswer?: string;
    isWrong?: boolean;
  };
  sourceCardId?: string;
  sourceKeyword?: string;
}

export interface CreateMicroLearningRequest {
  knowledgePointId: string;
  sessionId?: string;
  focusHint?: string;
}

export interface AskRequest {
  selectedText: string;
  sourceCardId: string;
  sourceCardContent: string;
}

export interface RetryExampleRequest {
  questionId: string;
}
