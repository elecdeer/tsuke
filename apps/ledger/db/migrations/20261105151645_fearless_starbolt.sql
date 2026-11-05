CREATE TABLE `statement_csv_descriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`mode` text NOT NULL,
	`place_name` text,
	`genre_id` integer,
	`category_id` integer,
	`counter_account_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_csv_descriptions_key_unique` ON `statement_csv_descriptions` (`key`);--> statement-breakpoint
CREATE TABLE `statement_csv_formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`header` text NOT NULL,
	`mapping` text NOT NULL,
	`account_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_csv_formats_header_unique` ON `statement_csv_formats` (`header`);