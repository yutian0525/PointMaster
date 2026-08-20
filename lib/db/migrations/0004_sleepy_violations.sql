CREATE TABLE `answer_ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`answer_record_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`answer_record_id`) REFERENCES `answer_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `aim_record_time_idx` ON `answer_ai_messages` (`answer_record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `answer_records` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`question_id` text NOT NULL,
	`knowledge_point_id` text NOT NULL,
	`user_answer` text NOT NULL,
	`correct_answer` text NOT NULL,
	`score` integer NOT NULL,
	`time_spent` integer NOT NULL,
	`round_index` integer NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ar_scope_idx` ON `answer_records` (`session_id`,`knowledge_point_id`,`mode`,`round_index`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`knowledge_point_order` text NOT NULL,
	`kp_mastery_snapshot` text NOT NULL,
	`current_kp_index` integer DEFAULT 0 NOT NULL,
	`current_mode` text DEFAULT 'normal' NOT NULL,
	`current_round_index` integer DEFAULT 1 NOT NULL,
	`custom_prompt` text,
	`planning_note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `question_banks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ps_bank_status_idx` ON `practice_sessions` (`bank_id`,`status`);--> statement-breakpoint
CREATE TABLE `user_mastery` (
	`id` text PRIMARY KEY NOT NULL,
	`bank_id` text NOT NULL,
	`knowledge_point_id` text NOT NULL,
	`mastery` real DEFAULT 0 NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`tested_count` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`last_updated` integer NOT NULL,
	FOREIGN KEY (`bank_id`) REFERENCES `question_banks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`knowledge_point_id`) REFERENCES `knowledge_points`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `um_bank_kp_unique` ON `user_mastery` (`bank_id`,`knowledge_point_id`);