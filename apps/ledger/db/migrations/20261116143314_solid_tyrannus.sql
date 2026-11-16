-- void:allow-destructive
-- 品目は内訳かカテゴリのどちらか一方だけを持つ。内訳のある品目のカテゴリは内訳の親から引くので、
-- 内訳を別のカテゴリへ移しても品目を書き換えずに済む。CHECK 制約を足すために表を作り直し、
-- 内訳のある品目の category_id は移すときに外す
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transaction_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`category_id` integer,
	`genre_id` integer,
	`name` text,
	`memo` text,
	`amount` integer NOT NULL,
	`is_advance_target` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transaction_items_genre_or_category" CHECK("genre_id" IS NULL OR "category_id" IS NULL)
);
--> statement-breakpoint
INSERT INTO `__new_transaction_items`("id", "transaction_id", "category_id", "genre_id", "name", "memo", "amount", "is_advance_target", "sort") SELECT "id", "transaction_id", CASE WHEN "genre_id" IS NULL THEN "category_id" END, "genre_id", "name", "memo", "amount", "is_advance_target", "sort" FROM `transaction_items`;--> statement-breakpoint
DROP TABLE `transaction_items`;--> statement-breakpoint
ALTER TABLE `__new_transaction_items` RENAME TO `transaction_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transaction_items_transaction_idx` ON `transaction_items` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_items_genre_idx` ON `transaction_items` (`genre_id`);--> statement-breakpoint
DROP INDEX `genres_id_category_unique`;