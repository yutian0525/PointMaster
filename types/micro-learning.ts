export type CardType = "concept" | "signal" | "template" | "pitfall" | "example" | "extended";

export interface MicroCard {
  id: string;
  type: CardType;
  title: string;
  content: string;
  importance: "required" | "recommended";
  sourceKeyword?: string;
}

export interface CardConnection {
  from: string;
  to: string;
  label: string;
}

export interface GenerateRequest {
  knowledgePointId: string;
  context?: {
    questions: Array<{
      id: string;
      content: string;
      options: string[];
      answer: string;
      analysis?: string;
    }>;
    answerRecords?: Array<{
      questionId: string;
      userAnswer: string;
      isCorrect: boolean;
      answerTime: number;
    }>;
    errorPatterns?: Array<{
      questionId: string;
      questionContent: string;
      wrongOption: string;
      correctOption: string;
    }>;
  };
}

export interface GenerateResponse {
  cards: MicroCard[];
  connections: CardConnection[];
}

export interface AskRequest {
  knowledgePointId: string;
  selectedText: string;
  sourceCardId: string;
  sourceCardContent: string;
}

export interface AskResponse {
  card: MicroCard;
  connection: CardConnection;
}

export interface MicroLearningRecord {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  bankId: string;
  generatedCards: string;
  extendedCards: string | null;
  context: string | null;
  createdAt: number;
}

export interface HistoryListItem {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  cardCount: number;
  extendedCardCount: number;
  createdAt: number;
}
