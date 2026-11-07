ALTER TABLE `import_batches` ADD `account_id` integer;--> statement-breakpoint
-- 既にある履歴 CSV の取り込みの口座を、取り込んだ取引から埋める。支出（返金を含む）は from、収入は to が CSV の口座になる。
-- 振替は相手の口座と見分けられないので使わず、振替だけの取り込みは null のままにする
UPDATE `import_batches` SET `account_id` = (
	SELECT CASE `transactions`.`mode` WHEN 'payment' THEN `transactions`.`from_account_id` ELSE `transactions`.`to_account_id` END
	FROM `transactions`
	WHERE `transactions`.`import_batch_id` = `import_batches`.`id` AND `transactions`.`mode` IN ('payment', 'income')
	LIMIT 1
) WHERE `source` = 'statement_csv';
