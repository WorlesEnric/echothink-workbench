CREATE TABLE `app_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner` text,
	`brief` text,
	`manifest_yaml` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`active_version` text,
	`workspace_path` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `domain_approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain_id` text NOT NULL,
	`version` text NOT NULL,
	`role` text NOT NULL,
	`user` text NOT NULL,
	`approved_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `app_domains`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `domain_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain_id` text NOT NULL,
	`version` text NOT NULL,
	`state` text NOT NULL,
	`release_manifest_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `app_domains`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domain_releases_domain_version_unique` ON `domain_releases` (`domain_id`,`version`);--> statement-breakpoint
CREATE TABLE `domain_validation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`domain_id` text NOT NULL,
	`run_id` text NOT NULL,
	`overall` text NOT NULL,
	`report_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`domain_id`) REFERENCES `app_domains`(`id`) ON UPDATE no action ON DELETE cascade
);
