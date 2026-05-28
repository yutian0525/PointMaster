import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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

export const microLearningRecords = sqliteTable("micro_learning_records", {
  id: text("id").primaryKey(),
  knowledgePointId: text("knowledge_point_id").notNull(),
  bankId: text("bank_id").notNull(),
  generatedCards: text("generated_cards").notNull(),
  extendedCards: text("extended_cards"),
  context: text("context"),
  createdAt: integer("created_at").notNull(),
});
