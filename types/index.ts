export interface ParsedQuestion {
  content: string;
  options: string[];
  answer: string;
  analysis?: string;
}

export interface BankStatus {
  status: "pending" | "extracting" | "building_graph" | "completed" | "failed";
  progress: number;
  progressMessage: string | null;
}

export interface KnowledgePointNode {
  id: string;
  name: string;
  description: string | null;
  prerequisiteIds: string[];
  questionCount: number;
  avgDifficulty: number | null;
}

export interface GraphData {
  nodes: KnowledgePointNode[];
  edges: { source: string; target: string }[];
}

export type {
  CardType,
  MicroCard,
  CardConnection,
  GenerateRequest,
  GenerateResponse,
  AskRequest,
  AskResponse,
  MicroLearningRecord,
  HistoryListItem,
} from "./micro-learning";
