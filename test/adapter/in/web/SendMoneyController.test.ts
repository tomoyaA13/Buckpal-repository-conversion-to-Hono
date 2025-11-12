import "reflect-metadata";

import {afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {env, SELF} from "cloudflare:test";
import {createClient} from "@supabase/supabase-js";
import {resetContainer, setupContainer} from "../../../../src/config/container";
import type {Database} from "../../../../supabase/database";
import type {CloudflareBindings} from "../../../../src/types/bindings";

/**
 * SendMoneyController の統合テスト（Webアダプタ層 + ローカルSupabase DB）
 *
 * 【このテストの目的】
 * - Web層（HTTPエンドポイント）が正しく動作するか検証
 * - リクエストの受付からレスポンスの返却までの流れを確認
 * - バリデーション、マッピング、エラーハンドリングが適切に機能するか検証
 * - **実際のSupabase DBを使用**して、エンドツーエンドの動作を保証
 *
 * 【テスト戦略】
 * このテストは「統合テスト」として実装します：
 * - SELF.fetch() を使用して、実際のHTTPリクエストをシミュレート
 *   → Honoのルーティング、ミドルウェア、バリデーションが実際に動作する
 * - **SendMoneyUseCaseはモック化しない** → 実際のビジネスロジックを実行
 * - **ローカルSupabase DBを使用** → 実際のデータベース操作を検証
 *
 * 【SupabaseAccountPersistenceAdapter.test.ts との違い】
 * - SupabaseAccountPersistenceAdapter.test.ts: 永続化層のみをテスト
 * - このテスト: Web層 → アプリケーション層 → ドメイン層 → 永続化層 の全体をテスト
 *
 * 【SELF.fetch() とは】
 * Cloudflare Workers のテスト環境で提供される特殊な機能：
 * - 実際のWorker（この場合はHonoアプリ）に対してHTTPリクエストを送信できる
 * - ルーティング、ミドルウェア、バリデーションなどが実際に実行される
 * - ブラウザのfetch APIと同じように使える
 *
 * 【テストピラミッドにおける位置づけ】
 * - 単体テスト: ドメインモデル（Account, Money等）← 別ファイルでテスト済み
 * - 統合テスト: ← このテスト（全レイヤーの連携 + 実際のDB）
 * - システムテスト: 完全なエンドツーエンド（本番環境に近い）
 *
 * 【なぜローカルDB使用が重要か】
 * 1. 実際のデータベース操作が正しく動作することを保証
 * 2. マッパーのバグ（型変換ミス等）を検出できる
 * 3. トランザクション、ロック、整合性制約などの動作を確認
 * 4. モックでは見つからないバグを早期に発見
 */
describe("SendMoneyController（Webアダプタ統合テスト + ローカルSupabase DB）", () => {
    // ========================================
    // テスト全体で共有する変数
    // ========================================

    /**
     * Supabaseクライアント: データベースに接続するためのオブジェクト
     *
     * 【なぜ型定義が複雑？】
     * ReturnType<typeof createClient<Database>>
     *
     * ステップ1: typeof createClient<Database>
     *   → createClient関数の型を取得
     *
     * ステップ2: ReturnType<...>
     *   → 関数の戻り値の型だけを抽出
     *   → SupabaseClient<Database>
     */
    let supabase: ReturnType<typeof createClient<Database>>;

    /**
     * テスト用のアカウントID（本番データと衝突しない大きな数値）
     *
     * 【なぜ999000番台？】
     * - 本番データは通常1番から始まる
     * - テストデータは大きな数値にして、本番データと衝突しないようにする
     * - 999000番台は「テスト専用」とすぐわかる
     */
    const TEST_ACCOUNT_SOURCE = 999001n; // 送金元アカウント（Aさん）
    const TEST_ACCOUNT_TARGET = 999002n; // 送金先アカウント（Bさん）

    /**
     * テスト用の環境変数（Cloudflare Workers Bindings）
     *
     * 【重要】USE_SUPABASE: "true" にすることで、Supabase永続化アダプタを使用
     * InMemoryアダプタではなく、実際のDBを使用するための設定
     */
    const mockEnv: CloudflareBindings = {
        SUPABASE_URL: "", // beforeAllで設定
        SUPABASE_PUBLISHABLE_KEY: "", // beforeAllで設定
        USE_SUPABASE: "true", // ← Supabaseを使用
        RESEND_API_KEY: ""
    };

    // ========================================
    // beforeAll: すべてのテスト実行前に1回だけ実行
    // 【目的】データベース接続など、共通の初期設定を行う
    // ========================================
    beforeAll(() => {
        // ===== 環境変数の確認と設定 =====
        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY;
        const resendApiKey = env.RESEND_API_KEY;  // ← 追加

        // 環境変数が設定されていない場合はエラーを投げる
        if (!supabaseUrl || !supabaseKey) {
            throw new Error(
                "❌ SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in vitest.config.ts"
            );
        }

        if (!resendApiKey) {  // ← 追加
            throw new Error("❌ RESEND_API_KEY must be set in vitest.config.ts");
        }

        console.log("✅ Environment variables loaded:");
        console.log(`   SUPABASE_URL: ${supabaseUrl}`);
        console.log(`   SUPABASE_PUBLISHABLE_KEY: ${supabaseKey.substring(0, 20)}...`);
        console.log(`   RESEND_API_KEY: ${resendApiKey.substring(0, 20)}...`);  // ← 追加

        // mockEnv に設定（DIコンテナで使用）
        mockEnv.SUPABASE_URL = supabaseUrl;
        mockEnv.SUPABASE_PUBLISHABLE_KEY = supabaseKey;
        mockEnv.RESEND_API_KEY = resendApiKey;  // ← 追加

        // ===== ローカルSupabaseクライアントを作成 =====
        supabase = createClient<Database>(supabaseUrl, supabaseKey);

        console.log("✅ Connected to local Supabase");
    });

    // ========================================
    // beforeEach: 各テスト実行前に毎回実行
    // 【目的】各テストを独立させる（前のテストの影響を受けない）
    // ========================================
    beforeEach(async () => {
        // ===== 1. 古いデータをクリーンアップ =====
        await cleanupTestData();

        // ===== 2. DIコンテナをリセット =====
        // 前のテストで登録された依存関係をクリア
        resetContainer();

        // ===== 3. DIコンテナを初期化 =====
        // setupContainer: 実際のアプリケーションと同じDI設定
        // 【重要】mockEnv.USE_SUPABASE = "true" なので、Supabaseアダプタが登録される
        setupContainer(mockEnv);

        // ===== 4. テスト用アカウントをDBに作成 =====
        const {error: accountError} = await supabase.from("accounts").insert([
            {id: Number(TEST_ACCOUNT_SOURCE)}, // 送金元アカウント（Aさん）
            {id: Number(TEST_ACCOUNT_TARGET)}, // 送金先アカウント（Bさん）
        ]);

        if (accountError) {
            throw new Error(`Failed to create test accounts: ${accountError.message}`);
        }

        console.log(
            `✅ Test accounts created: ${TEST_ACCOUNT_SOURCE}, ${TEST_ACCOUNT_TARGET}`
        );
    });

    // ========================================
    // afterEach: 各テスト実行後に毎回実行
    // 【目的】テスト後の後片付け
    // ========================================
    afterEach(async () => {
        // ===== データをクリーンアップ =====
        await cleanupTestData();

        // ===== DIコンテナをリセット =====
        resetContainer();

        console.log("✅ Test data cleaned up");
    });

    // ========================================
    // ヘルパー関数（テストで繰り返し使う共通機能）
    // ========================================

    /**
     * テストデータをクリーンアップするヘルパー関数
     *
     * 【実行順序が重要】
     * 1. activities テーブルを先に削除（外部キー制約）
     * 2. accounts テーブルを削除
     *
     * 【なぜ必要？】
     * - テスト同士が互いに影響しないようにする
     * - 各テストを独立して実行できるようにする
     */
    async function cleanupTestData() {
        // 1. アクティビティを削除
        await supabase
            .from("activities")
            .delete()
            .in("owner_account_id", [
                Number(TEST_ACCOUNT_SOURCE),
                Number(TEST_ACCOUNT_TARGET),
            ]);

        // 2. アカウントを削除
        await supabase
            .from("accounts")
            .delete()
            .in("id", [Number(TEST_ACCOUNT_SOURCE), Number(TEST_ACCOUNT_TARGET)]);
    }

    /**
     * テスト用アカウントに初期残高を設定するヘルパー関数
     *
     * 【仕組み】
     * - activitiesテーブルに「外部からの入金アクティビティ」を1件追加する
     * - source_account_id を null にすることで、システム外部からの入金を表現
     * - これにより、アカウントに指定した金額の残高ができる
     *
     * 【修正点（nullable対応）】
     * - source_account_id = null: 外部からの入金（給与、ATM入金、初期残高）
     * - これは実世界のビジネスドメインを正確に表現する
     *
     * @param accountId 残高を追加する対象のアカウントID
     * @param amount 初期残高（円）
     * @param timestamp アクティビティのタイムスタンプ
     */
    async function setupInitialBalance(
        accountId: bigint,
        amount: number,
        timestamp: Date = new Date("2024-12-01")
    ) {

        const {error} = await supabase.from("activities").insert([
            {
                owner_account_id: Number(accountId),
                source_account_id: null,  // ← 外部からの入金
                target_account_id: Number(accountId),  // ← このアカウントへ
                timestamp: timestamp.toISOString(),
                amount: amount,
            },
        ]);

        if (error) {
            throw new Error(`Failed to setup initial balance: ${error.message}`);
        }

        console.log(`✅ Initial balance set: Account ${accountId} = ${amount}円 (external deposit)`);
    }

    /**
     * アクティビティから残高を計算するヘルパー関数
     *
     * 【残高計算のルール（改訂版）】
     * 1. owner_account_id が自分のアクティビティのみを対象
     * 2. target が自分 → 入金（+）
     *    - source が null: 外部からの入金（給与、ATM入金）
     *    - source が他人: アカウント間送金（受取）
     *    - source が自分: アカウント内移動（※通常は発生しない）
     * 3. source が自分 → 出金（-）
     *    - target が null: 外部への出金（ATM出金、手数料）
     *    - target が他人: アカウント間送金（送金）
     *
     * 【重要】nullableによる明確な区別
     * - 外部入金: source=null, target=自分
     * - 外部出金: source=自分, target=null
     * - 送金: source=自分, target=他人
     * - 受取: source=他人, target=自分
     * - 同一アカウント送金: source=自分, target=自分 (※理論上可能だが稀)
     *
     * @param activities アクティビティの配列
     * @param accountId 対象アカウントID
     * @returns 残高
     */
    function calculateBalance(
        activities: Array<{
            owner_account_id: number;
            source_account_id: number | null;  // ← nullable
            target_account_id: number | null;  // ← nullable
            amount: number;
        }>,
        accountId: bigint
    ): number {
        return activities.reduce((sum, activity) => {
            const isOwner = activity.owner_account_id === Number(accountId);

            // 自分のアクティビティでない場合は無視
            if (!isOwner) return sum;

            const isTarget = activity.target_account_id === Number(accountId);
            const isSource = activity.source_account_id === Number(accountId);

            // 【パターン1】入金：target が自分
            // - 外部入金（source=null）: 給与、ATM入金
            // - 他人からの送金（source=他人）: 振込受取
            // - 自分からの送金（source=自分）: 同一アカウント送金（稀）
            if (isTarget) {
                // 同一アカウント送金の場合は相殺
                if (isSource) {
                    return sum; // ±0（出金と入金が相殺）
                }
                return sum + activity.amount; // 入金 (+)
            }

            // 【パターン2】出金：source が自分
            // - 外部出金（target=null）: ATM出金、手数料
            // - 他人への送金（target=他人）: 振込
            if (isSource) {
                return sum - activity.amount; // 出金 (-)
            }

            // 【パターン3】どちらでもない（エラーケース）
            // owner_account_id が自分なのに、source も target も自分でない
            // これは通常発生しないが、データ不整合の可能性
            console.warn("Invalid activity detected:", activity);
            return sum;
        }, 0);
    }

    // ========================================
    // 正常系テスト（JSONボディでのリクエスト）
    // ========================================

    /**
     * 正常系テスト: JSONボディでの送金リクエスト
     *
     * 【テストの目的】
     * - 最も一般的なAPIの使い方（JSONボディ）が正しく動作するか確認
     * - リクエスト → バリデーション → マッピング → ユースケース実行 → DB保存 → レスポンス
     *   という一連の流れが正常に機能するか検証
     *
     * 【SupabaseAccountPersistenceAdapter.test.ts との違い】
     * - あちらは「永続化層のみ」をテスト
     * - このテストは「Web層からDB層まで全体」をテスト
     */
    describe("✅ 正常系: JSONボディでの送金リクエスト", () => {
        /**
         * テストケース: 有効なJSONリクエストで送金が成功する
         *
         * 【シナリオ】
         * 1. 送金元アカウントに1000円の初期残高を設定
         * 2. 送金先アカウントに500円の初期残高を設定
         * 3. POST /api/accounts/send で500円送金
         * 4. レスポンスが200 OK
         * 5. DBを確認して、残高が正しく更新されているか検証
         */
        it("有効なJSONリクエストで送金が成功する", async () => {
            // ===== Arrange（準備）=====

            // 送金元アカウント（Aさん）に1000円の初期残高を設定
            await setupInitialBalance(TEST_ACCOUNT_SOURCE, 1000);

            // 送金先アカウント（Bさん）に500円の初期残高を設定
            await setupInitialBalance(TEST_ACCOUNT_TARGET, 500);

            // リクエストボディ（JSON形式）500円送金
            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(), // "999001"
                targetAccountId: TEST_ACCOUNT_TARGET.toString(), // "999002"
                amount: "500", // 500円送金
            };

            // ===== Act（実行）=====

            // SELF.fetch() で実際のHTTPリクエストを送信
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert（検証）=====

            // 1. HTTPステータスコードが200 OK
            // toBe(): プリミティブ値（数値）の比較
            // - 数値、文字列、真偽値などの単純な値の比較には toBe() を使用
            // - toEqual() でも動作するが、toBe() の方がシンプルで意図が明確
            expect(response.status).toBe(200);

            // 2. レスポンスボディの構造を検証
            const responseBody = await response.json();

            // toEqual() を使う理由:
            // - responseBody は毎回新しいオブジェクトとして生成される
            // - 参照の同一性ではなく「中身が正しいか」を確認したい
            // - toBe() を使うと参照が異なるため必ず失敗する
            expect(responseBody).toEqual({
                success: true,
                message: "Money transfer completed successfully",
                data: {
                    sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                    targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                    amount: "500",
                    timestamp: expect.any(String),
                },
            });

            // 3. DBを直接確認して、残高が正しく更新されているか検証

            // 送金元アカウントの残高確認
            // 期待値: 1000円 - 500円 = 500円
            const {data: sourceActivities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_SOURCE))
                .order("timestamp", {ascending: true});

            // 初期入金1000円 + 送金-500円 = 2件のアクティビティ
            expect(sourceActivities).toHaveLength(2);

            // 【修正】calculateBalance ヘルパー関数を使用
            const sourceBalance = calculateBalance(sourceActivities!, TEST_ACCOUNT_SOURCE);
            expect(sourceBalance).toBe(500); // 1000 - 500

            // 送金先アカウントの残高確認
            // 期待値: 500円 + 500円 = 1000円
            const {data: targetActivities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_TARGET))
                .order("timestamp", {ascending: true});

            // 初期入金500円 + 受取+500円 = 2件のアクティビティ
            expect(targetActivities).toHaveLength(2);

            // 【修正】calculateBalance ヘルパー関数を使用
            const targetBalance = calculateBalance(targetActivities!, TEST_ACCOUNT_TARGET);
            expect(targetBalance).toBe(1000); // 500 + 500
        });

        /**
         * テストケース: 大きな金額でも送金が成功する（限度額内）
         *
         * 【目的】
         * - 限度額（1,000,000円）ギリギリの金額でも正しく動作するか確認
         * - bigintを使用した大きな数値の処理が正しく行われるか検証
         */
        it("大きな金額（999999円）でも送金が成功する", async () => {
            // ===== Arrange =====

            // 送金元に2,000,000円の残高を設定（限度額の2倍）
            await setupInitialBalance(TEST_ACCOUNT_SOURCE, 2000000);

            // 送金先に初期残高0円（設定しない）

            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                amount: "999999", // 限度額に近い金額（限度額は1,000,000円）
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====
            expect(response.status).toBe(200);

            const responseBody = await response.json();
            expect(responseBody.success).toBe(true);
            expect(responseBody.data.amount).toBe("999999");

            // DB確認: 送金元の残高が正しく減っているか
            // 2,000,000 - 999,999 = 1,000,001
            const {data: sourceActivities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_SOURCE));

            // 【修正】calculateBalance ヘルパー関数を使用
            const sourceBalance = calculateBalance(sourceActivities!, TEST_ACCOUNT_SOURCE);
            expect(sourceBalance).toBe(1000001); // 2,000,000 - 999,999
        });
    });

    // ========================================
    // 異常系テスト: バリデーションエラー
    // ========================================

    describe("❌ 異常系: バリデーションエラー", () => {
        /**
         * テストケース: 不正な形式（数値以外の文字列）でバリデーションエラーになる
         */
        it("sourceAccountId が数値以外の場合、400エラーになる", async () => {
            // ===== Arrange =====
            const requestBody = {
                sourceAccountId: "abc", // ← 不正な値
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                amount: "500",
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====
            expect(response.status).toBe(400);

            // DBに変更がないことを確認
            const {data: activities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_SOURCE));

            expect(activities).toHaveLength(0); // アクティビティが作成されていない
        });

        /**
         * テストケース: 必須フィールドが欠落している場合、400エラーになる
         */
        it("必須フィールド（amount）が欠落している場合、400エラーになる", async () => {
            // ===== Arrange =====
            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                // amount が欠落
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====
            expect(response.status).toBe(400);
        });

        /**
         * テストケース: 負の金額はバリデーションで拒否される
         */
        it("負の金額はバリデーションで拒否される", async () => {
            // ===== Arrange =====
            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                amount: "-100", // ← 負の値
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====
            expect(response.status).toBe(400);
        });

        /**
         * テストケース: 0円はWeb層のバリデーションを通過するが、ドメイン層で拒否される
         */
        it("0円はWeb層のバリデーションを通過するが、コマンド作成時にエラーになる", async () => {
            // ===== Arrange =====
            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                amount: "0", // ← 形式的には正しいが、ビジネスルール違反
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====
            expect(response.status).toBe(500);

            const errorBody = await response.json();
            expect(errorBody.success).toBe(false);
            expect(errorBody.error.code).toBe("INTERNAL_ERROR");
        });
    });

    // ========================================
    // 異常系テスト: ビジネスロジックエラー
    // ========================================

    describe("❌ 異常系: ビジネスロジックエラー", () => {
        /**
         * テストケース: 残高不足で送金が失敗する
         *
         * 【シナリオ】
         * - 送金元の残高: 50円
         * - 送金額: 100円
         * - 期待結果: 400 Bad Request、残高不足エラー
         */
        it("残高不足で送金が失敗する", async () => {
            // ===== Arrange =====

            // 送金元に50円しか残高がない
            await setupInitialBalance(TEST_ACCOUNT_SOURCE, 50);

            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                amount: "100", // 50円しかないのに100円送金しようとする
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====

            // 1. HTTPステータスコードが400 Bad Request
            expect(response.status).toBe(400);

            // 2. エラーレスポンスの内容を確認
            const errorBody = await response.json();
            expect(errorBody.success).toBe(false);
            expect(errorBody.message).toBe("Money transfer failed - insufficient balance");
            expect(errorBody.error.code).toBe("INSUFFICIENT_BALANCE");

            // 3. DBを確認して、残高が変わっていないことを検証
            const {data: sourceActivities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_SOURCE));

            // 初期入金の1件のみ（失敗した送金は記録されない）
            expect(sourceActivities).toHaveLength(1);

            // 【修正】calculateBalance ヘルパー関数を使用
            const sourceBalance = calculateBalance(sourceActivities!, TEST_ACCOUNT_SOURCE);
            expect(sourceBalance).toBe(50); // 残高が50円のまま
        });

        /**
         * テストケース: 限度額超過で送金が失敗する
         *
         * 【シナリオ】
         * - 送金額: 2,000,000円（限度額1,000,000円を超える）
         * - 期待結果: 400 Bad Request、限度額超過エラー
         */
        it("限度額超過で送金が失敗する", async () => {
            // ===== Arrange =====

            // 送金元に十分な残高を設定（3,000,000円）
            await setupInitialBalance(TEST_ACCOUNT_SOURCE, 3000000);

            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                amount: "2000000", // 限度額(1,000,000円)を超える
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====

            // 1. HTTPステータスコードが400 Bad Request
            expect(response.status).toBe(400);

            // 2. エラーレスポンスの内容を確認
            const errorBody = await response.json();
            expect(errorBody.success).toBe(false);
            expect(errorBody.error.code).toBe("THRESHOLD_EXCEEDED");

            // 3. エラーの詳細情報が含まれている
            expect(errorBody.error.details).toEqual({
                threshold: "1000000",
                attempted: "2000000",
            });

            // 4. エラーメッセージが適切
            expect(errorBody.message).toContain("Maximum threshold");

            // 5. DBを確認して、残高が変わっていないことを検証
            const {data: sourceActivities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_SOURCE));

            // 初期入金の1件のみ
            expect(sourceActivities).toHaveLength(1);
        });

        /**
         * テストケース: 存在しないアカウントへの送金でエラーになる
         *
         * 【シナリオ】
         * - 送金先アカウントがDBに存在しない
         * - 期待結果: 500 Internal Server Error
         */
        it("存在しないアカウントへの送金でエラーになる", async () => {
            // ===== Arrange =====

            // 送金元に残高を設定
            await setupInitialBalance(TEST_ACCOUNT_SOURCE, 1000);

            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: "99999", // ← 存在しないアカウント
                amount: "500",
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====

            // 500 Internal Server Error
            expect(response.status).toBe(500);

            const errorBody = await response.json();
            expect(errorBody.success).toBe(false);
            expect(errorBody.error.code).toBe("INTERNAL_ERROR");
            expect(errorBody.message).toContain("Account not found");
        });
    });

    // ========================================
    // エッジケーステスト
    // ========================================

    describe("🔍 エッジケース", () => {
        /**
         * テストケース: 同じアカウント間の送金は禁止される
         *
         * 【ビジネスルール】
         * 同一アカウント送金は無意味な操作なので、ドメイン層で禁止
         */
        it("同じアカウント間の送金は禁止される（400エラー）", async () => {
            // ===== Arrange =====
            await setupInitialBalance(TEST_ACCOUNT_SOURCE, 1000);

            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_SOURCE.toString(), // ← 同じアカウント
                amount: "100",
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====

            // 1. HTTPステータスコードが400 Bad Request
            expect(response.status).toBe(400);

            // 2. エラーレスポンスの内容を確認
            const errorBody = await response.json();
            expect(errorBody.success).toBe(false);
            expect(errorBody.error.code).toBe("SAME_ACCOUNT_TRANSFER");
            expect(errorBody.message).toContain("Cannot transfer money to the same account");

            // 3. DBを確認して、送金が実行されていないことを検証
            const {data: activities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_SOURCE));

            // 初期入金の1件のみ（送金は作成されていない）
            expect(activities).toHaveLength(1);

            // 残高が変わっていないことを確認
            const balance = calculateBalance(activities!, TEST_ACCOUNT_SOURCE);
            expect(balance).toBe(1000); // 残高は1000円のまま
        });

        /**
         * テストケース: 非常に大きな金額（BigInt の範囲内）も処理できる
         */
        it("非常に大きな金額も処理できる（限度額を超えない範囲）", async () => {
            // ===== Arrange =====
            await setupInitialBalance(TEST_ACCOUNT_SOURCE, 999999);

            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                amount: "999999", // 限度額ギリギリ
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            // ===== Assert =====
            expect(response.status).toBe(200);

            // DB確認
            const {data: sourceActivities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_SOURCE));

            // 【修正】calculateBalance ヘルパー関数を使用
            const sourceBalance = calculateBalance(sourceActivities!, TEST_ACCOUNT_SOURCE);
            expect(sourceBalance).toBe(0); // 999999 - 999999
        });
    });

    // ========================================
    // 実践的なシナリオ
    // ========================================

    describe("📖 実践的なシナリオ", () => {
        /**
         * テストケース: 実際の送金シナリオ
         *
         * 【シナリオ】
         * - Alice（残高10,000円）が Bob に3,000円送金
         * - 期待結果:
         *   - Alice の残高: 7,000円
         *   - Bob の残高: 8,000円（元の5,000円 + 3,000円）
         */
        it("シナリオ: Alice (残高10000円) が Bob に 3000円送金", async () => {
            // ===== Arrange =====

            // Alice（送金元）に10,000円
            await setupInitialBalance(TEST_ACCOUNT_SOURCE, 10000);

            // Bob（送金先）に5,000円
            await setupInitialBalance(TEST_ACCOUNT_TARGET, 5000);

            const requestBody = {
                sourceAccountId: TEST_ACCOUNT_SOURCE.toString(),
                targetAccountId: TEST_ACCOUNT_TARGET.toString(),
                amount: "3000",
            };

            // ===== Act =====
            const response = await SELF.fetch("http://example.com/api/accounts/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            });

            console.log(response)

            // ===== Assert =====

            // 1. 送金が成功したか
            expect(response.status).toBe(200);

            // 2. Alice の残高が正しく減っているか
            const {data: aliceActivities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_SOURCE));

            // 【修正】calculateBalance ヘルパー関数を使用
            const aliceBalance = calculateBalance(aliceActivities!, TEST_ACCOUNT_SOURCE);
            expect(aliceBalance).toBe(7000); // 10000 - 3000

            // 3. Bob の残高が正しく増えているか
            const {data: bobActivities} = await supabase
                .from("activities")
                .select("*")
                .eq("owner_account_id", Number(TEST_ACCOUNT_TARGET));

            // 【修正】calculateBalance ヘルパー関数を使用
            const bobBalance = calculateBalance(bobActivities!, TEST_ACCOUNT_TARGET);
            expect(bobBalance).toBe(8000); // 5000 + 3000
        });
    });
});