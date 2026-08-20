import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const questionBanks = sqliteTable("question_banks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),
  totalQuestions: integer("total_questions").notNull().default(0),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  progressMessage: text("progress_message"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  content: text("content").notNull(),
  options: text("options").notNull(), // JSON array
  answer: text("answer").notNull(),
  analysis: text("analysis"),
  difficulty: real("difficulty"),
  questionType: text("question_type"),
  expectedTime: integer("expected_time"),
  aiExtracted: integer("ai_extracted").notNull().default(0),
  aiKnowledgePoints: text("ai_knowledge_points"), // JSON array
  createdAt: integer("created_at").notNull(),
});

export const knowledgePoints = sqliteTable("knowledge_points", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  name: text("name").notNull(),
  description: text("description"),
  prerequisiteIds: text("prerequisite_ids").notNull().default("[]"), // JSON array
  microContent: text("micro_content"), // JSON
  createdAt: integer("created_at").notNull(),
});

export const questionKnowledge = sqliteTable("question_knowledge", {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull().references(() => questions.id),
  knowledgePointId: text("knowledge_point_id").notNull().references(() => knowledgePoints.id),
  isPrimary: integer("is_primary").notNull().default(0),
});

export const practiceSessions = sqliteTable("practice_sessions", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  knowledgePointOrder: text("knowledge_point_order").notNull(),
  kpMasterySnapshot: text("kp_mastery_snapshot").notNull(),
  currentKpIndex: integer("current_kp_index").notNull().default(0),
  currentMode: text("current_mode").notNull().default("normal"),
  currentRoundIndex: integer("current_round_index").notNull().default(1),
  customPrompt: text("custom_prompt"),
  planningNote: text("planning_note"),
  status: text("status").notNull().default("active"),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => ({
  bankStatusIdx: index("ps_bank_status_idx").on(t.bankId, t.status),
}));

export const answerRecords = sqliteTable("answer_records", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => practiceSessions.id),
  questionId: text("question_id").notNull().references(() => questions.id),
  knowledgePointId: text("knowledge_point_id").notNull().references(() => knowledgePoints.id),
  userAnswer: text("user_answer").notNull(),
  correctAnswer: text("correct_answer").notNull(),
  score: integer("score").notNull(),
  timeSpent: integer("time_spent").notNull(),
  roundIndex: integer("round_index").notNull(),
  mode: text("mode").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  scopeIdx: index("ar_scope_idx").on(t.sessionId, t.knowledgePointId, t.mode, t.roundIndex),
}));

export const userMastery = sqliteTable("user_mastery", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  knowledgePointId: text("knowledge_point_id").notNull().references(() => knowledgePoints.id),
  mastery: real("mastery").notNull().default(0),
  confidence: real("confidence").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  testedCount: integer("tested_count").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  lastUpdated: integer("last_updated").notNull(),
}, (t) => ({
  bankKpUnique: uniqueIndex("um_bank_kp_unique").on(t.bankId, t.knowledgePointId),
}));

export const answerAiMessages = sqliteTable("answer_ai_messages", {
  id: text("id").primaryKey(),
  answerRecordId: text("answer_record_id").notNull().references(() => answerRecords.id),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => ({
  recordTimeIdx: index("aim_record_time_idx").on(t.answerRecordId, t.createdAt),
}));

export const microLearnings = sqliteTable("micro_learnings", {
  id: text("id").primaryKey(),
  knowledgePointId: text("knowledge_point_id").notNull().references(() => knowledgePoints.id),
  bankId: text("bank_id").notNull().references(() => questionBanks.id),
  sessionId: text("session_id"),
  focusHint: text("focus_hint"),
  detailedExplanation: text("detailed_explanation").notNull(),
  exampleAnalyses: text("example_analyses").notNull(),
  extendedCards: text("extended_cards"),
  cardPositions: text("card_positions"),
  sourceQuestionIds: text("source_question_ids"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
