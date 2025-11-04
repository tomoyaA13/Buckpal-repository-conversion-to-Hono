// ========================================
// インポート: テストに必要な機能を読み込む
// ========================================
import {afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
// describe: テストをグループ化する関数
// it: 個別のテストケースを定義する関数
// expect: テスト結果を検証する関数（アサーション）
// beforeAll: すべてのテストの実行前に1回だけ実行される
// beforeEach: 各テストの実行前に毎回実行される
// afterEach: 各テストの実行後に毎回実行される
import {env} from "cloudflare:test";
// Cloudflare Workers のテスト環境から環境変数を取得
import {createClient} from "@supabase/supabase-js";
// Supabaseデータベースに接続するためのクライアントライブラリ
import {
    SupabaseAccountPersistenceAdapter
} from "../../../../src/account/adapter/out/persistence/SupabaseAccountPersistenceAdapter";
// テスト対象: アカウントデータをSupabaseに保存/読み込みするアダプター
// これがヘキサゴナルアーキテクチャの「アウトバウンドアダプター」です
import {AccountId} from "../../../../src/account/application/domain/model/Activity";
import {Money} from "../../../../src/account/application/domain/model/Money";
// ドメインモデル: ビジネスロジックの中心となるクラス
import type {Database} from "../../../../supabase/database";
import {InsufficientBalanceException} from "../../../../src/account/application/domain/exception/InsufficientBalanceException";
// TypeScript型定義: Supabaseのテーブル構造を型安全に扱うため

/**
 * SupabaseAccountPersistenceAdapter の統合テスト
 *
 * 【統合テストとは？】
 * - 単体テスト: 1つのクラスやメソッドだけをテスト
 * - 統合テスト: 複数のコンポーネント（アダプター + DB）を組み合わせてテスト ← これ！
 * - システムテスト: アプリケーション全体をエンドツーエンドでテスト
 *
 * 【このテストが検証すること】
 * 1. アダプターが正しくデータベースからアカウント情報を読み込めるか
 * 2. アダプターが正しくデータベースにアクティビティを保存できるか
 * 3. ドメインモデル（Account）とデータベースが正しく連携できるか
 *
 * テスト環境: ローカルSupabase (Docker)
 * データベース: テスト専用のテーブルを使用
 * クリーンアップ: 各テスト前後で自動実行（テスト同士が影響しないように）
 */
describe("SupabaseAccountPersistenceAdapter（統合テスト - ローカルDB）", () => {
    // ========================================
    // テスト全体で共有する変数
    // ========================================

    // Supabaseクライアント: データベースに接続するためのオブジェクト
    //
    // 【型定義の仕組み】
    // ReturnType<typeof createClient<Database>>
    //
    // ステップ1: typeof createClient<Database>
    //   → createClient関数の型を取得（値→型の変換）
    //   → (url: string, key: string) => SupabaseClient<Database>
    //
    // ステップ2: ReturnType<...>
    //   → 関数の戻り値の型だけを抽出（関数型→戻り値型）
    //   → SupabaseClient<Database>
    let supabase: ReturnType<typeof createClient<Database>>;


    // テスト対象のアダプター: これをテストする！
    let adapter: SupabaseAccountPersistenceAdapter;

    // テスト用のアカウントID（本番データと衝突しない大きな数値）
    // bigint型（大きな整数）を使用
    const TEST_ACCOUNT_1 = 999001n; // Aさんのアカウント
    const TEST_ACCOUNT_2 = 999002n; // Bさんのアカウント

    // ========================================
// beforeAll: すべてのテスト実行前に1回だけ実行
// 【目的】データベース接続など、共通の初期設定を行う
// 【なぜ beforeAll？】
// - DB接続は重い処理（100ms程度）なので1回だけ実行
// - supabaseクライアントはステートレス（状態を持たない）ので全テストで共有しても安全
// ========================================
    beforeAll(() => {
        // ===== 環境変数の確認 =====
        // .dev.vars ファイルから必要な設定を読み込む
        const supabaseUrl = env.SUPABASE_URL;           // Supabaseのエンドポイント
        const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY; // 認証キー

        // 環境変数が設定されていない場合はエラーを投げる
        // （テストを実行する前提条件が満たされていない）
        if (!supabaseUrl || !supabaseKey) {
            throw new Error(
                "❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .dev.vars"
            );
        }

        console.log("✅ Environment variables loaded:");
        console.log(`   SUPABASE_URL: ${supabaseUrl}`);
        console.log(`   SUPABASE_PUBLISHABLE_KEY: ${supabaseKey.substring(0, 20)}...`);

        // ===== ローカルSupabaseクライアントを作成 =====
        // これでデータベースに接続できるようになる
        supabase = createClient<Database>(supabaseUrl, supabaseKey);

        console.log("✅ Connected to local Supabase");
    });

// ========================================
// beforeEach: 各テスト実行前に毎回実行
// 【目的】各テストを独立させる（前のテストの影響を受けない）
// 【なぜ beforeEach？】
// - アダプターは軽い処理（1ms程度）なので毎回作成しても問題なし
// - 毎回新しいインスタンスを作ることでテストの独立性を保つ
// - 将来的にアダプターが状態（キャッシュなど）を持つ可能性に備える
// ========================================
    beforeEach(async () => {
        // ===== 各テスト前: 古いデータをクリーンアップ =====
        // 前のテストで残ったデータを削除して、まっさらな状態にする
        await cleanupTestData();

        // ===== テスト用アカウントを作成 =====
        // accountsテーブルに2つのアカウントを挿入
        const {error} = await supabase.from("accounts").insert([
            {id: Number(TEST_ACCOUNT_1)}, // 999001番のアカウント
            {id: Number(TEST_ACCOUNT_2)}, // 999002番のアカウント
        ]);

        // 挿入に失敗した場合はエラーを投げる
        if (error) {
            throw new Error(`Failed to create test accounts: ${error.message}`);
        }

        // ===== アダプターを作成 =====
        // このアダプターをこれからテストする
        adapter = new SupabaseAccountPersistenceAdapter(supabase);

        console.log(`✅ Test accounts created: ${TEST_ACCOUNT_1}, ${TEST_ACCOUNT_2}`);
    });

    // ========================================
    // afterEach: 各テスト実行後に毎回実行
    // 【目的】テスト後の後片付け
    // ========================================
    afterEach(async () => {
        // ===== 各テスト後: データをクリーンアップ =====
        // テストで作成したデータを削除して、次のテストに影響しないようにする
        await cleanupTestData();
        console.log("✅ Test data cleaned up");
    });

    // ========================================
    // ヘルパー関数（テストで繰り返し使う共通機能）
    // ========================================

    /**
     * テストデータをクリーンアップするヘルパー関数
     *
     * 【なぜ必要？】
     * - テスト同士が互いに影響しないようにする
     * - 各テストを独立して実行できるようにする
     * - 「前のテストが失敗したから次も失敗する」という連鎖を防ぐ
     */
    async function cleanupTestData() {
        // ===== 1. アクティビティを削除（外部キー制約があるため先に削除）=====
        // accountsテーブルは activitiesテーブルから参照されているので、
        // activitiesを先に削除しないとエラーになる
        await supabase
            .from("activities")
            .delete()
            .in("owner_account_id", [Number(TEST_ACCOUNT_1), Number(TEST_ACCOUNT_2)]);
        // .in() で「TEST_ACCOUNT_1 または TEST_ACCOUNT_2 のどちらか」という条件

        // ===== 2. アカウントを削除 =====
        await supabase
            .from("accounts")
            .delete()
            .in("id", [Number(TEST_ACCOUNT_1), Number(TEST_ACCOUNT_2)]);
    }

    /**
     * テスト用アカウントに初期残高を設定するヘルパー関数
     *
     * 【修正内容】nullable対応
     * - source_account_id を null にして、外部からの入金を表現
     * - これにより、実世界のビジネスドメインを正確に表現できる
     *
     * 【なぜ必要？】
     * - ほとんどのテストで「既に残高があるアカウント」が必要
     * - 毎回同じコードを書くのは面倒
     * - この関数を使えば1行で初期残高を設定できる
     *
     * 【仕組み】
     * - activitiesテーブルに「外部からの入金アクティビティ」を1件追加する
     * - source_account_id = null: システム外部からの入金（給与、ATM入金、初期残高）
     * - これにより、アカウントに指定した金額の残高ができる
     *
     * @param accountId 残高を追加する対象のアカウントID
     * @param amount 初期残高（円）
     * @param timestamp アクティビティのタイムスタンプ（デフォルト: 2024-12-01）
     */
    async function setupInitialBalance(
        accountId: bigint,
        amount: number,
        timestamp: Date = new Date("2024-12-01")
    ) {
        // activitiesテーブルに「外部からの入金アクティビティ」を挿入
        const {error} = await supabase
            .from("activities")
            .insert([
                {
                    owner_account_id: Number(accountId),
                    source_account_id: null,  // ← 外部からの入金（nullable対応）
                    target_account_id: Number(accountId),
                    timestamp: timestamp.toISOString(),
                    amount: amount,
                },
            ]);

        if (error) {
            throw new Error(`Failed to setup initial balance: ${error.message}`);
        }

        console.log(`✅ Initial balance set: Account ${accountId} = ${amount}円 (external deposit)`);
    }

    // ========================================
    // loadAccount のテスト
    // 【目的】アダプターが正しくデータベースからアカウントを読み込めるかテスト
    // ========================================

    describe("loadAccount", () => {
        /**
         * テストケース1: アクティビティがない空のアカウントを読み込む
         *
         * 【検証内容】
         * - アカウントIDが正しいか
         * - 初期残高が0円か
         * - アクティビティが0件か
         */
        it("アカウントを読み込める（アクティビティなし）", async () => {
            // ===== Arrange（準備）=====
            // テストの前提条件を整える
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-01"); // 基準日

            // ===== Act（実行）=====
            // テスト対象のメソッドを実行
            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert（検証）=====
            // 期待通りの結果になっているか確認

            // アカウントが取得できたか
            expect(account).toBeDefined();

            // アカウントIDが正しいか
            expect(account.getId()?.getValue()).toBe(TEST_ACCOUNT_1);

            // 基準残高（baselineBalance）が0円か
            // baselineBalanceは「baselineDate以前の取引の合計残高」
            expect(account.getBaselineBalance().getAmount()).toBe(0n);

            // アクティビティウィンドウが空（0件）か
            // ActivityWindowは「baselineDate以降の取引履歴」
            expect(account.getActivityWindow().getActivities()).toHaveLength(0);
        });

        /**
         * テストケース2: アクティビティがあるアカウントを読み込む
         *
         * 【検証内容】
         * - アクティビティが正しく読み込まれるか（2件）
         * - 残高計算が正しいか（入金100円 - 出金50円 = 50円）
         */
        it("アカウントとアクティビティを読み込める", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-01");
            const now = new Date(); // 現在時刻

            // テスト用アクティビティを挿入
            // アクティビティ1: 100円の入金
            // アクティビティ2: 50円の出金
            const {error: insertError} = await supabase
                .from("activities")
                .insert([
                    {
                        owner_account_id: Number(TEST_ACCOUNT_1),  // このアカウントの取引
                        source_account_id: Number(TEST_ACCOUNT_2), // TEST_ACCOUNT_2から
                        target_account_id: Number(TEST_ACCOUNT_1), // TEST_ACCOUNT_1へ（入金）
                        timestamp: now.toISOString(),
                        amount: 100, // 100円
                    },
                    {
                        owner_account_id: Number(TEST_ACCOUNT_1),  // このアカウントの取引
                        source_account_id: Number(TEST_ACCOUNT_1), // TEST_ACCOUNT_1から（出金）
                        target_account_id: Number(TEST_ACCOUNT_2), // TEST_ACCOUNT_2へ
                        timestamp: now.toISOString(),
                        amount: 50, // 50円
                    },
                ]);

            if (insertError) {
                throw new Error(`Failed to insert activities: ${insertError.message}`);
            }

            // ===== Act =====
            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert =====

            // アカウントIDが正しいか
            expect(account.getId()?.getValue()).toBe(TEST_ACCOUNT_1);

            // アクティビティが2件読み込まれているか
            expect(account.getActivityWindow().getActivities()).toHaveLength(2);

            // 残高確認: +100円（入金）- 50円（出金）= 50円
            // calculateBalance()は baselineBalance + ActivityWindow の合計
            expect(account.calculateBalance().getAmount()).toBe(50n);
        });

        /**
         * テストケース3: baselineDate以降のアクティビティのみを読み込む
         *
         * 【重要な概念】
         * - baselineDate: 「この日付以前」と「以降」を分ける境界線
         * - baselineBalance: baselineDate以前の取引の合計残高（スナップショット）
         * - ActivityWindow: baselineDate以降の取引履歴（詳細データ）
         *
         * 【なぜこの分け方？】
         * - パフォーマンス: 古い取引を毎回読み込むと遅い
         * - 過去の取引は「合計値（baselineBalance）」だけ持てば十分
         * - 最近の取引は「詳細データ」として保持
         *
         * 【検証内容】
         * - baselineBalance = 1000円（入金）- 300円（出金）= 700円
         * - ActivityWindow = 1件（baselineDate以降の入金200円のみ）
         * - 最終残高 = 700円 + 200円 = 900円
         */
        it("baselineDate以降のアクティビティのみを読み込む", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-15"); // 1月15日を境界線にする

            // ===== baselineDate以前のアクティビティ（2件）=====
            // これらは合計値（baselineBalance）としてのみ扱われる
            await supabase.from("activities").insert([
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_2),
                    target_account_id: Number(TEST_ACCOUNT_1),
                    timestamp: new Date("2025-01-10").toISOString(), // 1/10 < 1/15（境界線より前）
                    amount: 1000, // 1000円入金
                },
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_1),
                    target_account_id: Number(TEST_ACCOUNT_2),
                    timestamp: new Date("2025-01-12").toISOString(), // 1/12 < 1/15（境界線より前）
                    amount: 300, // 300円出金
                },
            ]);

            // ===== baselineDate以降のアクティビティ（1件）=====
            // これは詳細データ（ActivityWindow）として保持される
            await supabase.from("activities").insert([
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),
                    source_account_id: Number(TEST_ACCOUNT_2),
                    target_account_id: Number(TEST_ACCOUNT_1),
                    timestamp: new Date("2025-01-20").toISOString(), // 1/20 > 1/15（境界線より後）
                    amount: 200, // 200円入金
                },
            ]);

            // ===== Act =====
            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert =====

            // baselineBalance（境界線以前の合計）= 1000円 - 300円 = 700円
            expect(account.getBaselineBalance().getAmount()).toBe(700n);

            // ActivityWindow（境界線以降の詳細）には1件だけ含まれる
            expect(account.getActivityWindow().getActivities()).toHaveLength(1);

            // 最終残高 = baselineBalance(700円) + 新しいアクティビティ(200円) = 900円
            expect(account.calculateBalance().getAmount()).toBe(900n);
        });

        /**
         * テストケース4: 存在しないアカウントを読み込もうとするとエラー
         *
         * 【検証内容】
         * - 存在しないアカウントIDを指定すると例外がスローされるか
         * - エラーメッセージが適切か
         */
        it("存在しないアカウントを読み込むとエラー", async () => {
            // ===== Arrange =====
            const nonExistentId = new AccountId(99999n); // 存在しないID
            const baselineDate = new Date("2025-01-01");

            // ===== Act & Assert =====
            // loadAccountを実行すると例外がスローされることを期待
            await expect(
                adapter.loadAccount(nonExistentId, baselineDate)
            ).rejects.toThrow("Account not found");
            // .rejects.toThrow() = 「この非同期処理がエラーを投げることを期待」
        });
    });

    // ========================================
    // updateActivities のテスト
    // 【目的】アダプターが正しくデータベースにアクティビティを保存できるかテスト
    // ========================================

    describe("updateActivities", () => {
        /**
         * テストケース5: 新規アクティビティをDBに保存できる
         *
         * 【シナリオ】
         * 1. 初期残高1000円のアカウントを作成
         * 2. 100円を引き出す（メモリ上で操作）
         * 3. updateActivities()でDBに保存
         * 4. DBから直接データを取得して、正しく保存されているか確認
         *
         * 【検証内容】
         * - アクティビティがDBに1件保存されているか
         * - 金額が100円か
         * - 送金元・送金先が正しいか
         */
        it("新規アクティビティをDBに保存できる", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const targetAccountId = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高を設定（1000円）
            await setupInitialBalance(TEST_ACCOUNT_1, 1000);

            // アカウントを読み込む
            const account = await adapter.loadAccount(accountId, baselineDate);

            // 残高確認（初期状態）
            expect(account.calculateBalance().getAmount()).toBe(1000n);

            // ===== Act =====
            // アカウントに操作を実行（メモリ上で100円引き出す）
            // 注: この時点ではまだDBには保存されていない！
            account.withdraw(Money.of(100), targetAccountId);

            // updateActivities()を呼び出してDBに保存
            await adapter.updateActivities(account);

            // ===== Assert =====
            // DBから直接アクティビティを取得して確認
            const {data: activities, error} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_1)) // このアカウントの
                .gte("timestamp", baselineDate.toISOString())   // baselineDate以降の
                .order("timestamp", {ascending: false});       // 新しい順に

            // エラーがないか
            expect(error).toBeNull();

            // アクティビティが1件保存されているか
            expect(activities).toHaveLength(1);

            // 金額が100円か
            expect(activities![0].amount).toBe(100);

            // 送金元が TEST_ACCOUNT_1 か（引き出しなので）
            expect(activities![0].source_account_id).toBe(Number(TEST_ACCOUNT_1));

            // 送金先が TEST_ACCOUNT_2 か
            expect(activities![0].target_account_id).toBe(Number(TEST_ACCOUNT_2));
        });

        /**
         * テストケース6: 複数の新規アクティビティを一度に保存できる
         *
         * 【シナリオ】
         * 1. 初期残高500円のアカウントを作成
         * 2. 3つの操作を実行（メモリ上）
         *    - 100円引き出し（残高: 500 → 400円）
         *    - 50円入金（残高: 400 → 450円）
         *    - 30円引き出し（残高: 450 → 420円）
         * 3. updateActivities()で一度にDBに保存
         * 4. 3件すべて保存されているか確認
         * 5. 再読み込みして残高が420円になっているか確認
         */
        it("複数の新規アクティビティを一度に保存できる", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const targetAccountId = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高を設定（500円あれば十分）
            await setupInitialBalance(TEST_ACCOUNT_1, 500);

            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Act =====
            // 複数の操作を実行（すべてメモリ上で）
            account.withdraw(Money.of(100), targetAccountId); // 500 - 100 = 400
            account.deposit(Money.of(50), targetAccountId);    // 400 + 50 = 450
            account.withdraw(Money.of(30), targetAccountId);  // 450 - 30 = 420


            // 一度にDBに保存
            await adapter.updateActivities(account);

            // ===== Assert =====
            // DBから新規アクティビティを取得
            const {data: activities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_1))
                .gte("timestamp", baselineDate.toISOString()) // baselineDate以降のみ
                .order("timestamp", {ascending: true});      // 古い順に

            // baselineDate以降の新規アクティビティが3件あるか
            expect(activities).toHaveLength(3);

            // 残高確認: 500 - 100 + 50 - 30 = 420
            // アカウントを再読み込みして確認
            const reloadedAccount = await adapter.loadAccount(accountId, baselineDate);
            expect(reloadedAccount.calculateBalance().getAmount()).toBe(420n);
        });

        /**
         * テストケース7: 新規アクティビティがない場合、何もしない
         *
         * 【シナリオ】
         * 1. アカウントを読み込む
         * 2. 何も操作しない
         * 3. updateActivities()を呼ぶ
         * 4. DBにアクティビティが保存されていないことを確認
         *
         * 【重要】
         * - 不要なDB書き込みを避ける（パフォーマンス向上）
         * - バグを防ぐ（意図しないデータ挿入を防ぐ）
         */
        it("新規アクティビティがない場合、何もしない", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-01");

            const account = await adapter.loadAccount(accountId, baselineDate);
            // 何も操作しない（withdraw も deposit も呼ばない）

            // ===== Act =====
            await adapter.updateActivities(account);

            // ===== Assert =====
            // DBにアクティビティがないことを確認
            const {data: activities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_1));

            expect(activities).toHaveLength(0);
        });

        /**
         * テストケース8: 残高不足の場合、withdrawが失敗し、DBに保存されない
         *
         * 【これはドメインルールのテスト】
         *
         * 【ビジネスルール】
         * - 残高が不足している場合、引き出しは拒否される
         * - 失敗した操作はDBに記録されない
         *
         * 【シナリオ】
         * 1. 初期残高50円のアカウントを作成
         * 2. 100円引き出そうとする → 失敗するはず
         * 3. updateActivities()を呼ぶ
         * 4. DBに新規アクティビティが保存されていないことを確認
         * 5. 残高が変わっていないことを確認（50円のまま）
         *
         * 【なぜこのテストが重要？】
         * - ドメインロジックが正しく動作することを保証
         * - 不正な操作がDBに記録されないことを保証
         */
        it("残高不足の場合、withdrawが失敗し、DBに保存されない（ドメインルールのテスト）", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const targetAccountId = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高50円のみ
            await setupInitialBalance(TEST_ACCOUNT_1, 50);

            const account = await adapter.loadAccount(accountId, baselineDate);
            expect(account.calculateBalance().getAmount()).toBe(50n);

            // ===== Act & Assert=====
            // 残高50円しかないのに100円引き出そうとする
            expect(() => {
                account.withdraw(Money.of(100), targetAccountId);
            }).toThrow(InsufficientBalanceException);

            // updateActivities()を呼んでも、失敗した操作はDBに保存されない
            await adapter.updateActivities(account);

            // DBに新規アクティビティがないことを確認
            const {data: activities} = await supabase
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
    // 【目的】実際のアプリケーションで起こりうるシナリオをテスト
    // ========================================

    describe("📖 実践的なシナリオ", () => {
        /**
         * テストケース9: アカウント読み込み→操作→保存→再読み込みが正しく動作する
         *
         * 【これは実際のアプリケーションの流れをシミュレート】
         *
         * 【実際のアプリケーションでの流れ】
         * 1. ユーザーがアカウント画面を開く → loadAccount()
         * 2. ユーザーが「送金」ボタンを押す → withdraw()
         * 3. 送金が実行される → updateActivities()
         * 4. 画面を更新する → 再度 loadAccount()
         * 5. 新しい残高が表示される
         *
         * 【このテストが失敗すると】
         * - ユーザーが送金しても、画面に反映されない
         * - データの整合性が失われる
         * - 重大なバグになる可能性がある
         */
        it("アカウント読み込み→操作→保存→再読み込みが正しく動作する", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const targetAccountId = new AccountId(TEST_ACCOUNT_2);
            const baselineDate = new Date("2025-01-01");

            // 初期残高を設定
            await setupInitialBalance(TEST_ACCOUNT_1, 1000);

            // ===== 1. アカウントを読み込む =====
            // （ユーザーがアカウント画面を開く）
            const account = await adapter.loadAccount(accountId, baselineDate);
            const initialBalance = account.calculateBalance();

            // 初期残高が1000円であることを確認
            expect(initialBalance.getAmount()).toBe(1000n);

            // ===== 2. 操作を実行 =====
            // （ユーザーが「100円送金」ボタンを押す）
            account.withdraw(Money.of(100), targetAccountId);

            // ===== Act =====
            // ===== 3. 保存 =====
            // （送金が実行される）
            await adapter.updateActivities(account);

            // ===== 4. 再度読み込み =====
            // （画面を更新する）
            const reloadedAccount = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert =====
            // ===== 5. 新しい残高が正しいか確認 =====
            // 残高が正しく反映されている: 1000円 - 100円 = 900円
            expect(reloadedAccount.calculateBalance().getAmount()).toBe(900n);

            // baselineDate以降のアクティビティが保存されている
            const newActivities = reloadedAccount
                .getActivityWindow()
                .getActivities()
                .filter(a => a.getTimestamp() >= baselineDate);
            expect(newActivities).toHaveLength(1); // 新規アクティビティが1件
        });

        /**
         * テストケース10: Aさんの口座から引き出し→DBに保存→残高確認
         *
         * 【わかりやすい実例】
         *
         * 【物語】
         * 1. Aさんの口座に10,000円ある
         * 2. Aさんが3,000円を引き出す
         * 3. 残高が7,000円になる
         *
         * 【このテストで確認すること】
         * - Aさんの初期残高が10,000円か
         * - 引き出しが成功するか
         * - DBに正しく保存されるか
         * - 再読み込み後の残高が7,000円か
         */
        it("シナリオ: Aさんの口座から引き出し→DBに保存→残高確認", async () => {
            // ===== Arrange =====
            const accountIdA = new AccountId(TEST_ACCOUNT_1); // Aさんのアカウント
            const accountIdB = new AccountId(TEST_ACCOUNT_2); // Bさんのアカウント
            const baselineDate = new Date("2025-01-01");

            // ===== 初期残高を設定（過去のアクティビティとして）=====
            // 2024年12月1日に、Bさんから Aさんへ 10,000円が入金されたという設定
            await supabase.from("activities").insert([
                {
                    owner_account_id: Number(TEST_ACCOUNT_1),  // Aさんの取引
                    source_account_id: Number(TEST_ACCOUNT_2), // Bさんから
                    target_account_id: Number(TEST_ACCOUNT_1), // Aさんへ（入金）
                    timestamp: new Date("2024-12-01").toISOString(), // 2024年12月1日
                    amount: 10000, // 初期入金10,000円
                },
            ]);

            // ===== アカウントを読み込む =====
            const accountA = await adapter.loadAccount(accountIdA, baselineDate);

            // ===== 初期残高確認 =====
            // Aさんの残高が10,000円であることを確認
            expect(accountA.calculateBalance().getAmount()).toBe(10000n);

            // ===== Act =====
            // ===== Aさんが3,000円を引き出す =====
            accountA.withdraw(Money.of(3000), accountIdB);

            // ===== DBに保存 =====
            await adapter.updateActivities(accountA);

            // ===== 再読み込み =====
            const reloadedAccountA = await adapter.loadAccount(accountIdA, baselineDate);

            // ===== Assert =====
            // ===== 残高確認 =====
            // 残高: 10,000円 - 3,000円 = 7,000円
            expect(reloadedAccountA.calculateBalance().getAmount()).toBe(7000n);
        });

        /**
         * 【新規追加】テストケース: 外部からの入金（給与、ATM入金）
         */
        it("シナリオ: 外部からの入金を処理できる", async () => {
            // ===== Arrange =====
            const accountId = new AccountId(TEST_ACCOUNT_1);
            const baselineDate = new Date("2025-01-01");

            // 初期残高を設定（外部からの入金として）
            await setupInitialBalance(TEST_ACCOUNT_1, 5000);

            // アカウントを読み込む
            const account = await adapter.loadAccount(accountId, baselineDate);

            // ===== Assert =====
            // 初期残高が5000円であることを確認
            expect(account.calculateBalance().getAmount()).toBe(5000n);

            // DBから直接アクティビティを取得
            const {data: activities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_1));

            // 外部からの入金として記録されているか確認
            expect(activities).toHaveLength(1);
            expect(activities![0].source_account_id).toBeNull();  // ← 外部から
            expect(activities![0].target_account_id).toBe(Number(TEST_ACCOUNT_1));
            expect(activities![0].amount).toBe(5000);
        });
    });
});