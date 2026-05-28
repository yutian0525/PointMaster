CREATE TABLE `knowledge_points` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`prerequisite_ids` text DEFAULT '[]' NOT NULL,
	`micro_content` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `question_banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `question_banks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`file_name` text NOT NULL,
	`total_questions` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`progress_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`knowledge_point_id` text NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`content` text NOT NULL,
	`options` text NOT NULL,
	`answer` text NOT NULL,
	`analysis` text,
	`difficulty` real,
	`question_type` text,
	`expected_time` integer,
	`ai_extracted` integer DEFAULT 0 NOT NULL,
	`ai_knowledge_points` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `question_banks`(`id`) ON UPDATE no action ON DELETE no action
);
