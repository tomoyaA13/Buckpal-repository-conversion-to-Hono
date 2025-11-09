-- ========================================
-- テスト用シードデータ
-- ========================================

-- 【重要】既存のデータをクリア
-- テストデータとの競合を避けるため、まずテーブルをクリアします
TRUNCATE TABLE activities RESTART IDENTITY CASCADE;
TRUNCATE TABLE accounts RESTART IDENTITY CASCADE;

-- ========================================
-- 1. アカウントの作成
-- ========================================

-- テスト用アカウントを作成
-- Buckpalプロジェクトでは、アカウント間の送金をテストするため複数のアカウントが必要
INSERT INTO accounts (id, created_at)
VALUES (1, '2024-01-01 00:00:00+00'), -- アカウント1: Aliceさん
       (2, '2024-01-01 00:00:00+00'), -- アカウント2: Bobさん
       (3, '2024-01-01 00:00:00+00');
-- アカウント3: Charlieさん

-- ========================================
-- 2. 初期残高の設定（外部からの入金として）
-- ========================================

-- 【重要な概念】
-- Buckpalプロジェクトでは、初期残高を「外部からの入金」として表現します
-- source_account_id = NULL → システム外部からの入金（給与、ATM入金、初期残高など）

-- Alice (アカウント1) の初期残高: 10,000円
INSERT INTO activities (owner_account_id,
                        source_account_id, -- NULL = 外部からの入金
                        target_account_id,
                        timestamp,
                        amount)
VALUES (1, -- Aliceのアカウント
        NULL, -- 外部から（給与や初期設定など）
        1, -- Aliceのアカウントへ入金
        '2024-12-01 10:00:00+00',
        10000 -- 10,000円
       );

-- Bob (アカウント2) の初期残高: 5,000円
INSERT INTO activities (owner_account_id,
                        source_account_id,
                        target_account_id,
                        timestamp,
                        amount)
VALUES (2,
        NULL,
        2,
        '2024-12-01 10:00:00+00',
        5000);

-- Charlie (アカウント3) の初期残高: 15,000円
INSERT INTO activities (owner_account_id,
                        source_account_id,
                        target_account_id,
                        timestamp,
                        amount)
VALUES (3,
        NULL,
        3,
        '2024-12-01 10:00:00+00',
        15000);

-- ========================================
-- 3. アカウント間の送金履歴（サンプルデータ）
-- ========================================

-- AliceからBobへ 1,000円の送金
INSERT INTO activities (owner_account_id,
                        source_account_id,
                        target_account_id,
                        timestamp,
                        amount)
VALUES
    -- Aliceの視点（送金）
    (1, 1, 2, '2024-12-10 14:30:00+00', 1000),
    -- Bobの視点（受取）
    (2, 1, 2, '2024-12-10 14:30:00+00', 1000);

-- BobからCharlieへ 500円の送金
INSERT INTO activities (owner_account_id,
                        source_account_id,
                        target_account_id,
                        timestamp,
                        amount)
VALUES
    -- Bobの視点（送金）
    (2, 2, 3, '2024-12-15 16:45:00+00', 500),
    -- Charlieの視点（受取）
    (3, 2, 3, '2024-12-15 16:45:00+00', 500);

-- CharlieからAliceへ 2,000円の送金
INSERT INTO activities (owner_account_id,
                        source_account_id,
                        target_account_id,
                        timestamp,
                        amount)
VALUES
    -- Charlieの視点（送金）
    (3, 3, 1, '2024-12-20 11:20:00+00', 2000),
    -- Aliceの視点（受取）
    (1, 3, 1, '2024-12-20 11:20:00+00', 2000);

-- ========================================
-- 最終的な残高確認用のクエリ（参考）
-- ========================================
-- このクエリを実行すると各アカウントの残高が確認できます

-- SELECT
--     owner_account_id,
--     SUM(
--         CASE
--             WHEN target_account_id = owner_account_id THEN amount  -- 入金
--             WHEN source_account_id = owner_account_id THEN -amount -- 出金
--             ELSE 0
--         END
--     ) AS balance
-- FROM activities
-- GROUP BY owner_account_id
-- ORDER BY owner_account_id;

-- 期待される残高:
-- アカウント1 (Alice):   10,000 - 1,000 + 2,000 = 11,000円
-- アカウント2 (Bob):      5,000 + 1,000 - 500 =    5,500円
-- アカウント3 (Charlie): 15,000 + 500 - 2,000 =   13,500円