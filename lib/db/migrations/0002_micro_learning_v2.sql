CREATE TABLE `micro_learnings` (
	`id` text PRIMARY KEY NOT NULL,
	`knowledge_point_id` text NOT NULL,
	`bank_id` text NOT NULL,
	`session_id` text,
	`focus_hint` text,
	`detailed_explanation` text NOT NULL,
	`example_analyses` text NOT NULL,
	`extended_cards` text,
	`source_question_ids` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_id`) REFERENCES `question_banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `micro_learning_records`;