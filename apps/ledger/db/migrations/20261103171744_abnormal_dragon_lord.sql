CREATE TABLE `advance_reimbursements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_transaction_id` integer NOT NULL,
	`income_transaction_id` integer NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`payment_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`income_transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `advance_reimbursements_income_idx` ON `advance_reimbursements` (`income_transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `advance_reimbursements_payment_income_unique` ON `advance_reimbursements` (`payment_transaction_id`,`income_transaction_id`);--> statement-breakpoint
ALTER TABLE `transaction_items` ADD `is_advance_target` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `advance_amount` integer DEFAULT 0 NOT NULL;