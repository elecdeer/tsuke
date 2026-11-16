-- 画面を確かめるための架空のデータ。LEDGER_PERSIST_TO で分けたローカルの D1 に入れる（本物の記録の DB には入れない）
INSERT INTO accounts (id, name, sort) VALUES (1, '財布', 0), (2, '銀行', 1), (3, 'クレジットカード', 2), (4, '解約した口座', 3);
UPDATE accounts SET archived = 1 WHERE id = 4;

INSERT INTO categories (id, mode, name, sort) VALUES
  (1, 'payment', '食費', 0), (2, 'payment', '日用品', 1), (3, 'payment', '交通', 2), (4, 'payment', '住まい', 3),
  (11, 'income', '給与', 0), (12, 'income', 'その他', 1);
INSERT INTO genres (id, category_id, name, sort) VALUES
  (1, 1, '食料品', 0), (2, 1, '外食', 1), (3, 1, 'カフェ', 2),
  (4, 2, '消耗品', 0), (5, 3, '電車', 0), (6, 4, '家賃', 0);
INSERT INTO places (id, name) VALUES (1, 'スーパーみどり'), (2, 'コンビニあおば'), (3, '喫茶ひだまり'), (4, '株式会社サンプル');

-- 9 月
INSERT INTO transactions (id, date, mode, from_account_id, place_id, source) VALUES (1, '2026-09-03', 'payment', 1, 1, 'manual');
INSERT INTO transaction_items (transaction_id, genre_id, name, amount, sort) VALUES (1, 1, '野菜', 1280, 0), (1, 4, '洗剤', 398, 1);
INSERT INTO transactions (id, date, mode, from_account_id, place_id, source) VALUES (2, '2026-09-12', 'payment', 3, 3, 'zaim_csv');
INSERT INTO transaction_items (transaction_id, genre_id, name, amount, sort) VALUES (2, 3, 'ブレンド', 520, 0);
INSERT INTO transactions (id, date, mode, from_account_id, place_id, source) VALUES (3, '2026-09-27', 'payment', 2, NULL, 'zaim_csv');
INSERT INTO transaction_items (transaction_id, genre_id, name, amount, sort) VALUES (3, 6, NULL, 85000, 0);
INSERT INTO transactions (id, date, mode, to_account_id, place_id, source) VALUES (4, '2026-09-25', 'income', 2, 4, 'zaim_csv');
INSERT INTO transaction_items (transaction_id, category_id, amount, sort) VALUES (4, 11, 280000, 0);

-- 10 月
INSERT INTO transactions (id, date, mode, from_account_id, place_id, source) VALUES (5, '2026-10-02', 'payment', 1, 1, 'manual');
INSERT INTO transaction_items (transaction_id, genre_id, name, memo, amount, sort) VALUES
  (5, 1, '牛乳', NULL, 238, 0), (5, 1, '卵', '10 個入り', 268, 1), (5, 1, '値引き', NULL, -50, 2), (5, 4, 'ティッシュ', NULL, 358, 3);
INSERT INTO transactions (id, date, mode, from_account_id, place_id, source) VALUES (6, '2026-10-05', 'payment', 3, 2, 'manual');
INSERT INTO transaction_items (transaction_id, genre_id, name, amount, sort) VALUES (6, 2, 'お弁当', 598, 0);
INSERT INTO transactions (id, date, mode, from_account_id, place_id, source) VALUES (7, '2026-10-09', 'payment', 3, 3, 'manual');
INSERT INTO transaction_items (transaction_id, genre_id, name, amount, sort) VALUES (7, 3, 'カフェラテ', 560, 0);
INSERT INTO transactions (id, date, mode, from_account_id, place_id, source) VALUES (8, '2026-10-14', 'payment', 2, NULL, 'manual');
INSERT INTO transaction_items (transaction_id, genre_id, name, amount, sort) VALUES (8, 5, '定期券', 12340, 0);
INSERT INTO transactions (id, date, mode, from_account_id, place_id, aggregation, source) VALUES (9, '2026-10-18', 'payment', 3, 1, 'never', 'manual');
INSERT INTO transaction_items (transaction_id, genre_id, name, memo, amount, sort) VALUES (9, 1, '立て替え分', '後で精算', 3000, 0);
INSERT INTO transactions (id, date, mode, from_account_id, place_id, source) VALUES (10, '2026-10-27', 'payment', 2, NULL, 'manual');
INSERT INTO transaction_items (transaction_id, genre_id, name, amount, sort) VALUES (10, 6, NULL, 85000, 0);
INSERT INTO transactions (id, date, mode, to_account_id, place_id, source) VALUES (11, '2026-10-24', 'income', 2, 4, 'manual');
INSERT INTO transaction_items (transaction_id, category_id, amount, sort) VALUES (11, 11, 280000, 0);
INSERT INTO transactions (id, date, mode, to_account_id, source) VALUES (12, '2026-10-20', 'income', 1, 'manual');
INSERT INTO transaction_items (transaction_id, category_id, memo, amount, sort) VALUES (12, NULL, 'ポイント', 500, 0);
INSERT INTO transactions (id, date, mode, from_account_id, to_account_id, source) VALUES (13, '2026-10-01', 'transfer', 2, 1, 'manual');
INSERT INTO transaction_items (transaction_id, amount, sort) VALUES (13, 20000, 0);
INSERT INTO transactions (id, date, mode, from_account_id, to_account_id, source) VALUES (14, '2026-10-26', 'transfer', 2, 3, 'manual');
INSERT INTO transaction_items (transaction_id, memo, amount, sort) VALUES (14, 'カードの引き落とし', 15000, 0);
INSERT INTO transactions (id, date, mode, from_account_id, source) VALUES (15, '2026-10-28', 'adjustment', 1, 'manual');
INSERT INTO transaction_items (transaction_id, amount, sort) VALUES (15, 120, 0);
