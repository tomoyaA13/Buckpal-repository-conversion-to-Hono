// test/adapter/out/persistence/SupabaseAccountPersistenceAdapter.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { createClient } from "@supabase/supabase-js";
import { SupabaseAccountPersistenceAdapter } from "../../../../src/adapter/out/persistence/SupabaseAccountPersistenceAdapter";
import { AccountId } from "../../../../src/application/domain/model/Activity";
import { Money } from "../../../../src/application/domain/model/Money";
import type { Database } from "../../../../supabase/database";

/**
 * SupabaseAccountPersistenceAdapter の統合テスト
 *
 * テスト環境: ローカルSupabase (Docker)
 * データベース: テスト専用のテーブルを使用
 * クリーンアップ: 各テスト前後で自動実行
 */
describe("SupabaseAccountPersistenceAdapter（統合テスト - ローカルDB）", () => {
    let supabase: ReturnType<typeof createClient<Database>>;
    let adapter: SupabaseAccountPersistenceAdapter;

    // テスト用のアカウントID（本番データと衝突しない大きな数値）
    const TEST_ACCOUNT_1 = 999001n;
    const TEST_ACCOUNT_2 = 999002n;

    beforeAll(() => {
        // ===== 環境変数の確認 =====
        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error(
                "❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .dev.vars"
            );
        }

        console.log("✅ Environment variables loaded:");
        console.log(`   SUPABASE_URL: ${supabaseUrl}`);
        console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey.substring(0, 20)}...`);

        // ===== ローカルSupabaseクライアントを作成 =====
        supabase = createClient<Database>(supabaseUrl, supabaseKey);

        console.log("✅ Connected to local Supabase");
    });

    beforeEach(async () => {
        // ===== 各テスト前: データをクリーンアップ =====
        await cleanupTestData();

        // ===== テスト用アカウントを作成 =====
        const { error } = await supabase.from("accounts").insert([
            { id: Number(TEST_ACCOUNT_1) },
            { id: Number(TEST_ACCOUNT_2) },
        ]);

        if (error) {
            throw new Error(`Failed to create test accounts: ${error.message}`);
        }

        // ===== アダプターを作成 =====
        adapter = new SupabaseAccountPersistenceAdapter(supabase);

        console.log(`✅ Test accounts created: ${TEST_ACCOUNT_1}, ${TEST_ACCOUNT_2}`);
    });

    afterEach(async () => {
        // ===== 各テスト後: データをクリーンアップ =====
        await cleanupTestData();
        console.log("✅ Test data cleaned up");
    });

    /**
     * テストデータをクリーンアップするヘルパー関数
     */
    async function cleanupTestData() {
        // アクティビティを削除（外部キー制約があるため先に削除）
        await supabase
            .from("activities")
            .delete()
            .in("owner_account_id", [Number(TEST_ACCOUNT_1), Number(TEST_ACCOUNT_2)]);

        // アカウントを削除
        await supabase
            .from("accounts")
            .delete()
            .in("id", [Number(TEST_ACCOUNT_1), Number(TEST_ACCOUNT_2)]);
    }

    /**
     * テスト用アカウントに初期残高を設定するヘルパー関数
     * 
     * @param accountId 対象アカウントID
     * @param amount 初期残高（円）
     * @param timestamp アクティビティのタイムスタンプ（デフォルト: 2024-12-01）
     */
    async function setupInitialBalance(
        accountId: bigint,
        amount: number,
        timestamp: Date = new Date("2024-12-01")
    ) {
        const { error } = await supabase.from("activities").insert([
            {
                owner_account_id: Number(accountId),
                source_account_id: Number(TEST_ACCOUNT_2), // 外部からの入金
                target_account_id: Number(accountId),
                timestamp: timestamp.toISOString(),
                amount: amount,
            },
        ]);

        if (error) {
            throw new Error(`Failed to setup initial balance: ${error.message}`);
        }

        console.log(`✅ Initial balance set: ${accountId} = ${amount}`);
    }

    // ========================================
    // loadAccount のテスト
    // ========================================

    describe("loadAccount", () => {
        it("アカウントを読み込める（アクティビティなし）", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-01");

            // ===== Act =====
            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert =====
            expect(account).toBeDefined();
            expect(account.getId()?.getValue()).toBe(TEST_ACCOUNT_1);
            expect(account.getBaselineBalance().getAmount()).toBe(0n);
            expect(account.getActivityWindow().getActivities()).toHaveLength(0);
        });

        it("アカウントとアクティビティを読み込める", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-01");
            const now = new Date();

            // テスト用アクティビティを挿入
            const { error: insertError } = await supabase.from("activities").insert([
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_2),
                    target_account_id: Number(TEST_ACCOUNT_1),
                    timestamp: now.toISOString(),
                    amount: 100,
                },
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_1),
                    target_account_id: Number(TEST_ACCOUNT_2),
                    timestamp: now.toISOString(),
                    amount: 50,
                },
            ]);

            if (insertError) {
                throw new Error(`Failed to insert activities: ${insertError.message}`);
            }

            // ===== Act =====
            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert =====
            expect(account.getId()?.getValue()).toBe(TEST_ACCOUNT_1);
            expect(account.getActivityWindow().getActivities()).toHaveLength(2);

            // 残高確認: +100 (入金) - 50 (出金) = 50
            expect(account.calculateBalance().getAmount()).toBe(50n);
        });

        it("baselineDate以降のアクティビティのみを読み込む", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-15");

            // baselineDate以前のアクティビティ
            await supabase.from("activities").insert([
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_2),
                    target_account_id: Number(TEST_ACCOUNT_1),
                    timestamp: new Date("2025-01-10").toISOString(),
                    amount: 1000,
                },
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_1),
                    target_account_id: Number(TEST_ACCOUNT_2),
                    timestamp: new Date("2025-01-12").toISOString(),
                    amount: 300,
                },
            ]);

            // baselineDate以降のアクティビティ
            await supabase.from("activities").insert([
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_2),
                    target_account_id: Number(TEST_ACCOUNT_1),
                    timestamp: new Date("2025-01-20").toISOString(),
                    amount: 200,
                },
            ]);

            // ===== Act =====
            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert =====

            // baselineBalance = 1000 (入金) - 300 (出金) = 700
            expect(account.getBaselineBalance().getAmount()).toBe(700n);

            // ActivityWindow には baselineDate以降のアクティビティのみ（1件）
            expect(account.getActivityWindow().getActivities()).toHaveLength(1);

            // 最終残高 = baselineBalance(700) + 新しいアクティビティ(200) = 900
            expect(account.calculateBalance().getAmount()).toBe(900n);
        });

        it("存在しないアカウントを読み込むとエラー", async () => {
            // ===== Arrange =====
            const nonExistentId = new AccountId(99999n);
            const baselineDate = new Date("2025-01-01");

            // ===== Act & Assert =====
            await expect(
                adapter.loadAccount(nonExistentId, baselineDate)
            ).rejects.toThrow("Account not found");
        });
    });

    // ========================================
    // updateActivities のテスト
    // ========================================

    describe("updateActivities", () => {
        it("新規アクティビティをDBに保存できる", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const targetAccountId = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高を設定（1000円）
            await setupInitialBalance(TEST_ACCOUNT_1, 1000);

            // アカウントを読み込む
            const account = await adapter.loadAccount(accountId, baselineDate);

            // 残高確認
            expect(account.calculateBalance().getAmount()).toBe(1000n);

            // ===== Act =====
            // アカウントに操作を実行（新規アクティビティが作られる）
            const success = account.withdraw(Money.of(100), targetAccountId);
            expect(success).toBe(true);

            await adapter.updateActivities(account);

            // ===== Assert =====
            // DBから直接アクティビティを取得して確認
            const { data: activities, error } = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_1))
                .gte("timestamp", baselineDate.toISOString())
                .order("timestamp", { ascending: false });

            expect(error).toBeNull();
            expect(activities).toHaveLength(1);
            expect(activities![0].amount).toBe(100);
            expect(activities![0].source_account_id).toBe(Number(TEST_ACCOUNT_1));
            expect(activities![0].target_account_id).toBe(Number(TEST_ACCOUNT_2));
        });

        it("複数の新規アクティビティを一度に保存できる", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const targetAccountId = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高を設定（500円あれば十分）
            await setupInitialBalance(TEST_ACCOUNT_1, 500);

            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Act =====
            // 複数の操作を実行
            const withdraw1 = account.withdraw(Money.of(100), targetAccountId); // 500 - 100 = 400
            const deposit1 = account.deposit(Money.of(50), targetAccountId);    // 400 + 50 = 450
            const withdraw2 = account.withdraw(Money.of(30), targetAccountId);  // 450 - 30 = 420

            expect(withdraw1).toBe(true);
            expect(deposit1).toBe(true);
            expect(withdraw2).toBe(true);

            await adapter.updateActivities(account);

            // ===== Assert =====
            const { data: activities } = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_1))
                .gte("timestamp", baselineDate.toISOString())
                .order("timestamp", { ascending: true });

            // baselineDate以降の新規アクティビティのみ（3件）
            expect(activities).toHaveLength(3);
            
            // 残高確認: 500 - 100 + 50 - 30 = 420
            const reloadedAccount = await adapter.loadAccount(accountId, baselineDate);
            expect(reloadedAccount.calculateBalance().getAmount()).toBe(420n);
        });

        it("新規アクティビティがない場合、何もしない", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-01");

            const account = await adapter.loadAccount(accountId, baselineDate);
            // 何も操作しない

            // ===== Act =====
            await adapter.updateActivities(account);

            // ===== Assert =====
            const { data: activities } = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_1));

            expect(activities).toHaveLength(0);
        });

        it("残高不足の場合、withdrawが失敗し、DBに保存されない（ドメインルールのテスト）", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const targetAccountId = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高50円のみ
            await setupInitialBalance(TEST_ACCOUNT_1, 50);

            const account = await adapter.loadAccount(accountId, baselineDate);
            expect(account.calculateBalance().getAmount()).toBe(50n);

            // ===== Act =====
            // 残高50円しかないのに100円引き出そうとする
            const success = account.withdraw(Money.of(100), targetAccountId);

            // ===== Assert =====
            expect(success).toBe(false); // 失敗することを確認

            // DBには新規アクティビティが保存されない
            await adapter.updateActivities(account);

            const { data: activities } = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_1))
                .gte("timestamp", baselineDate.toISOString());

            expect(activities).toHaveLength(0); // 新規アクティビティなし

            // 残高は変わらず50円のまま
            expect(account.calculateBalance().getAmount()).toBe(50n);
        });
    });

    // ========================================
    // エンドツーエンドシナリオ
    // ========================================

    describe("📖 実践的なシナリオ", () => {
        it("アカウント読み込み→操作→保存→再読み込みが正しく動作する", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const targetAccountId = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高を設定
            await setupInitialBalance(TEST_ACCOUNT_1, 1000);

            // 1. アカウントを読み込む
            const account = await adapter.loadAccount(accountId, baselineDate);
            const initialBalance = account.calculateBalance();

            expect(initialBalance.getAmount()).toBe(1000n); // 初期残高確認

            // 2. 操作を実行
            const success = account.withdraw(Money.of(100), targetAccountId);
            expect(success).toBe(true);

            // ===== Act =====
            // 3. 保存
            await adapter.updateActivities(account);

            // 4. 再度読み込み
            const reloadedAccount = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert =====
            // 残高が正しく反映されている: 1000 - 100 = 900
            expect(reloadedAccount.calculateBalance().getAmount()).toBe(900n);

            // baselineDate以降のアクティビティが保存されている
            const newActivities = reloadedAccount
                .getActivityWindow()
                .getActivities()
                .filter(a => a.getTimestamp() >= baselineDate);
            expect(newActivities).toHaveLength(1);
        });

        it("シナリオ: Aさんの口座から引き出し→DBに保存→残高確認", async () => {
            // ===== Arrange =====
            const aさん = new AccountId(TEST_ACCOUNT_1);
            const bさん = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高を設定（過去のアクティビティとして）
            await supabase.from("activities").insert([
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_2),
                    target_account_id: Number(TEST_ACCOUNT_1),
                    timestamp: new Date("2024-12-01").toISOString(),
                    amount: 10000, // 初期入金10000円
                },
            ]);

            // アカウントを読み込む
            const aさんのアカウント = await adapter.loadAccount(aさん, baselineDate);

            // 初期残高確認
            expect(aさんのアカウント.calculateBalance().getAmount()).toBe(10000n);

            // ===== Act =====
            // 3000円送金
            const success = aさんのアカウント.withdraw(Money.of(3000), bさん);
            expect(success).toBe(true);

            // DBに保存
            await adapter.updateActivities(aさんのアカウント);

            // 再読み込み
            const 再読み込み後 = await adapter.loadAccount(aさん, baselineDate);

            // ===== Assert =====
            // 残高: 10000 - 3000 = 7000
            expect(再読み込み後.calculateBalance().getAmount()).toBe(7000n);
        });
    });
});