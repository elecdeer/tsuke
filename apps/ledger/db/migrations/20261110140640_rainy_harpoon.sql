CREATE TABLE `genre_inferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`source` text NOT NULL,
	`model` text NOT NULL,
	`place_name` text,
	`item_name` text,
	`amount` integer NOT NULL,
	`inferred_genre_id` integer,
	`genre_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `genre_inferences_transaction_idx` ON `genre_inferences` (`transaction_id`);