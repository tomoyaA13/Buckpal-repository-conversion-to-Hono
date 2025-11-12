import "reflect-metadata"

import {beforeEach, describe, expect, it, vi} from "vitest";
import {container} from "tsyringe";
import {SendMoneyApplicationService} from "../../../src/account/application/service/SendMoneyApplicationService";
import {SendMoneyCommand} from "../../../src/account/application/port/in/SendMoneyCommand";
import {SendMoneyUseCaseToken} from "../../../src/account/application/port/in/SendMoneyUseCase";
import {LoadAccountPort, LoadAccountPortToken} from "../../../src/account/application/port/out/LoadAccountPort";
import {
    UpdateAccountStatePort,
    UpdateAccountStatePortToken
} from "../../../src/account/application/port/out/UpdateAccountStatePort";
import {AccountLock, AccountLockToken} from "../../../src/account/application/port/out/AccountLock";
import {
    MoneyTransferProperties,
    MoneyTransferPropertiesToken
} from "../../../src/account/application/domain/service/MoneyTransferProperties";
import {SendMoneyDomainService} from "../../../src/account/application/domain/service/SendMoneyDomainService";
import {ThresholdExceededException} from "../../../src/account/application/domain/exception/ThresholdExceededException";
import {Account} from "../../../src/account/application/domain/model/Account";
import {AccountId} from "../../../src/account/application/domain/model/Activity";
import {ActivityWindow} from "../../../src/account/application/domain/model/ActivityWindow";
import {Money} from "../../../src/account/application/domain/model/Money";
import {
    InsufficientBalanceException
} from "../../../src/account/application/domain/exception/InsufficientBalanceException";
import {EventBusToken, EventStorePortToken} from "../../../src/config/types";
import {EventBus} from "../../../src/common/event/EventBus";
import {EventStorePort} from "../../../src/common/event/port/EventStorePort";
import {MoneyTransferredEvent} from "../../../src/common/event/events/MoneyTransferredEvent";

/**
 * SendMoneyApplicationService の統合テスト
 *
 * 【このテストの目的】
 * - アプリケーションサービス層のビジネスロジックが正しく動作するか検証
 * - ドメインサービスとの連携が正しく行われるか確認
 * - ポート（外部依存）をモック化して、アプリケーション層のロジックに集中
 *
 * 【テスト戦略】
 * - ポート（LoadAccountPort, UpdateAccountStatePort, AccountLock）はモック
 *   → 外部システム（DB、ロック機構）の影響を受けずにテストできる
 * - ドメインサービス（SendMoneyDomainService）は実物を使用
 *   → 実際のビジネスロジックが正しく実行されることを保証
 * - ビジネスロジックの流れを検証
 *   → 「アカウント読込 → ロック取得 → 送金処理 → 更新 → ロック解放」の流れ
 *
 * 【テストピラミッドにおける位置づけ】
 * このテストは「統合テスト」に該当します：
 * - 単体テスト: ドメインモデル（Account, Money等）の個別の振る舞い
 * - 統合テスト: ← このテスト（複数のコンポーネントの連携）
 * - システムテスト: HTTPリクエストからレスポンスまでのエンドツーエンド
 */
describe("SendMoneyApplicationService（統合テスト）", () => {
    // ===== モックの型定義 =====
    // テストで使用するモックオブジェクトの変数を定義
    // これらは beforeEach で毎回新しいインスタンスが作成される
    let mockLoadAccountPort: LoadAccountPort;
    let mockUpdateAccountStatePort: UpdateAccountStatePort;
    let mockAccountLock: AccountLock;
    let mockMoneyTransferProperties: MoneyTransferProperties;

    // ===== テスト対象のサービス =====
    // 実際にテストする SendMoneyApplicationService のインスタンス
    let sendMoneyService: SendMoneyApplicationService;

    let mockEventStore: EventStorePort;

    // ===== 共通のテストデータ =====
    // 複数のテストで使い回すアカウントID
    // bigint（1n）を使用しているのは、データベースのBIGINT型に対応するため
    const sourceAccountId = new AccountId(1n);
    const targetAccountId = new AccountId(2n);

    /**
     * beforeEach: 各テストケース実行前に実行される初期化処理
     *
     * 【なぜ beforeEach が必要か】
     * - テスト間の独立性を保つため（前のテストの影響を受けない）
     * - モックの状態をクリーンにして、各テストが同じ条件から開始できる
     * - DIコンテナをリセットして、依存関係の注入状態を初期化
     */
    beforeEach(() => {
        // ===== DIコンテナをクリーンアップ =====
        // tsyringeのコンテナに登録された全てのインスタンスをクリア
        // これにより、前のテストで登録されたモックが残らない
        container.clearInstances();

        // ===== モックの作成 =====

        // LoadAccountPort のモック
        // 【役割】データベースからアカウント情報を読み込むポート
        // 【モック化する理由】実際のDBアクセスを避け、テストを高速化＆安定化
        mockLoadAccountPort = {
            loadAccount: vi.fn(),
        };

        // UpdateAccountStatePort のモック
        // 【役割】アカウントの状態（残高、アクティビティ）をDBに保存するポート
        // 【デフォルトの振る舞い】成功を表すPromise<void>を返す
        mockUpdateAccountStatePort = {
            updateActivities: vi.fn().mockResolvedValue(undefined),
        };

        // AccountLock のモック
        // 【役割】並行処理時のアカウントロック機構
        // 【重要性】複数の送金が同時に発生しても、データ不整合を防ぐ
        mockAccountLock = {
            lockAccount: vi.fn(),
            releaseAccount: vi.fn(),
        };

        // MoneyTransferProperties のモック（限度額: 100万円）
        // 【役割】送金の上限額を定義するビジネスルール
        // 【設定値の意味】1回の送金で最大100万円まで送金可能
        mockMoneyTransferProperties = new MoneyTransferProperties(
            Money.of(1000000)
        );

        // ✅ 追加: EventStorePort のモック
        mockEventStore = {
            save: vi.fn().mockResolvedValue(undefined),
            findById: vi.fn().mockResolvedValue(null),
            findByType: vi.fn().mockResolvedValue([]),
            findByDateRange: vi.fn().mockResolvedValue([]),
        };

        // ===== DIコンテナにモックとサービスを登録 =====
        // tsyringeのDIコンテナに、各トークン（シンボル）とモックを関連付ける

        // LoadAccountPortToken でモックを注入
        container.register(LoadAccountPortToken, {
            useValue: mockLoadAccountPort,
        });

        // UpdateAccountStatePortToken でモックを注入
        container.register(UpdateAccountStatePortToken, {
            useValue: mockUpdateAccountStatePort,
        });

        // AccountLockToken でモックを注入
        container.register(AccountLockToken, {
            useValue: mockAccountLock,
        });

        // MoneyTransferPropertiesToken でモックを注入
        container.register(MoneyTransferPropertiesToken, {
            useValue: mockMoneyTransferProperties,
        });


        // ✅ 追加: EventStorePort を登録（オプショナルなのでモックでOK）
        container.register(EventStorePortToken, {useValue: mockEventStore});

        // ✅ 追加: EventBus を実物として登録
        container.registerSingleton(EventBus);
        container.register(EventBusToken, {useToken: EventBus});


        // SendMoneyDomainService は実物を使う（統合テストのポイント）
        // 【重要】ドメインサービスはモック化せず、実際のビジネスロジックを実行
        // これにより「ドメインロジックが正しく動作するか」を検証できる
        container.register(SendMoneyDomainService, SendMoneyDomainService);

        // テスト対象のサービスを登録
        // SendMoneyUseCaseToken で SendMoneyApplicationService を注入
        container.register(SendMoneyUseCaseToken, {
            useClass: SendMoneyApplicationService,
        });

        // ===== テスト対象のサービスを取得 =====
        // DIコンテナから、テスト対象のサービスインスタンスを取得
        // この時点で、コンストラクタに全ての依存関係（モック）が注入される
        sendMoneyService = container.resolve(SendMoneyApplicationService);
    });

    // ========================================
    // 正常系テスト
    // ========================================

    /**
     * 正常系テスト
     *
     * 【テストの目的】
     * - 最も基本的で重要な「ハッピーパス」が動作することを確認
     * - ビジネスルールが守られた状態での送金処理を検証
     *
     * 【検証すべきこと】
     * 1. 送金が成功する（戻り値がtrue）
     * 2. 各ポートが正しい順序・回数で呼ばれる
     * 3. アカウントの残高が正しく更新される
     * 4. ロックの取得・解放が正しく行われる
     */
    describe("✅ 正常系: 送金が成功する", () => {
        /**
         * テストケース: 残高が十分な場合、送金に成功する
         *
         * 【シナリオ】
         * - 送金元: 残高1000円
         * - 送金先: 残高500円
         * - 送金額: 500円
         * - 期待結果: 送金成功、残高が正しく更新される
         */
        it("残高が十分な場合、送金に成功する", async () => {
            // ===== Arrange（準備）=====
            // テストに必要なデータとモックの振る舞いを設定

            // 送金額を定義（500円）
            const transferAmount = Money.of(500);

            // 送金元アカウント（残高1000円）を作成
            // Account.withId: IDを持つ既存のアカウントを表現
            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(1000), // 初期残高
                new ActivityWindow() // 空のアクティビティウィンドウ（過去の取引履歴）
            );

            // 送金先アカウント（残高500円）を作成
            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            // loadAccount モックの振る舞いを設定
            // 【重要】mockResolvedValueOnce は「1回だけ」指定した値を返す
            // - 1回目の呼び出し: sourceAccount を返す（送金元の読み込み）
            // - 2回目の呼び出し: targetAccount を返す（送金先の読み込み）
            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)  // 1回目: sourceAccount
                .mockResolvedValueOnce(targetAccount); // 2回目: targetAccount

            // SendMoneyCommand を作成
            // これは「送金リクエスト」を表すコマンドオブジェクト
            const command = new SendMoneyCommand(
                sourceAccountId,  // どのアカウントから
                targetAccountId,  // どのアカウントへ
                transferAmount    // いくら送金するか
            );

            // ===== Act（実行）=====
            // テスト対象のメソッドを実行
            await sendMoneyService.sendMoney(command);

            // ===== Assert（検証）=====
            // 実行結果が期待通りか検証

            // 2. loadAccount が2回呼ばれたか（送金元と送金先）
            expect(mockLoadAccountPort.loadAccount).toHaveBeenCalledTimes(2);

            // 1回目の呼び出しで、送金元アカウントIDと基準日が渡されたか
            // expect.any(Date): 任意の Date オブジェクトを許容
            expect(mockLoadAccountPort.loadAccount).toHaveBeenNthCalledWith(
                1, // 1回目の呼び出し
                sourceAccountId,
                expect.any(Date) // 基準日（アクティビティの読み込み範囲を決定） 型だけチェック（値は不問）
            );

            // 2回目の呼び出しで、送金先アカウントIDと基準日が渡されたか
            expect(mockLoadAccountPort.loadAccount).toHaveBeenNthCalledWith(
                2, // 2回目の呼び出し
                targetAccountId,
                expect.any(Date) // ← 型だけチェック（値は不問）
            );

            // 3. アカウントがロックされたか
            // 【重要】並行処理時のデータ競合を防ぐため、両方のアカウントをロック
            expect(mockAccountLock.lockAccount).toHaveBeenCalledTimes(2);

            // 送金元アカウントがロックされたか
            expect(mockAccountLock.lockAccount).toHaveBeenNthCalledWith(
                1,
                sourceAccountId
            );

            // 送金先アカウントがロックされたか
            expect(mockAccountLock.lockAccount).toHaveBeenNthCalledWith(
                2,
                targetAccountId
            );

            // 4. ドメインロジックが正しく実行されたか（残高の変化を確認）
            // 【検証ポイント】Account オブジェクトの状態が正しく更新されている
            expect(sourceAccount.calculateBalance().getAmount()).toBe(500n); // 1000 - 500
            expect(targetAccount.calculateBalance().getAmount()).toBe(1000n); // 500 + 500

            // 5. updateActivities が2回呼ばれたか
            // 【目的】送金元と送金先の両方の取引履歴をDBに保存
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenCalledTimes(2);

            // 1回目: 送金元アカウントの更新
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenNthCalledWith(
                1,
                sourceAccount
            );

            // 2回目: 送金先アカウントの更新
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenNthCalledWith(
                2,
                targetAccount
            );

            // 6. ロックが解放されたか（finally句で実行される）
            // 【重要】エラーが発生しても必ずロックを解放することを保証
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);

            // 送金元アカウントのロック解放
            expect(mockAccountLock.releaseAccount).toHaveBeenNthCalledWith(
                1,
                sourceAccountId
            );

            // 送金先アカウントのロック解放
            expect(mockAccountLock.releaseAccount).toHaveBeenNthCalledWith(
                2,
                targetAccountId
            );

            // 7. 新しいアクティビティが作成されたか
            // 【検証ポイント】送金の記録（Activity）が両方のアカウントに追加される
            // getNewActivities(): 未保存の新しいアクティビティを取得
            expect(sourceAccount.getNewActivities()).toHaveLength(1);
            expect(targetAccount.getNewActivities()).toHaveLength(1);
        });

        /**
         * テストケース: 限度額ギリギリの金額でも送金できる
         *
         * 【目的】
         * - 境界値テスト（boundary value testing）
         * - 限度額ちょうどの金額で送金できることを確認
         *
         * 【なぜ重要か】
         * - 境界値（limit）付近でバグが発生しやすい
         * - 「limit未満」と「limit以下」の実装ミスを検出
         */
        it("限度額ギリギリの金額でも送金できる", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(1000000); // 限度額ちょうど

            // 送金元は限度額の2倍の残高を持つ（送金可能）
            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(2000000),
                new ActivityWindow()
            );

            // 送金先は残高0円
            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(0),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act =====
            await sendMoneyService.sendMoney(command);

            // ===== Assert =====
            // 残高の確認
            // 送金元: 2000000 - 1000000 = 1000000
            expect(sourceAccount.calculateBalance().getAmount()).toBe(1000000n);

            // 送金先: 0 + 1000000 = 1000000
            expect(targetAccount.calculateBalance().getAmount()).toBe(1000000n);
        });
    });

    // ========================================
    // 異常系テスト: ビジネスルール違反
    // ========================================

    /**
     * 異常系テスト: ビジネスルール違反
     *
     * 【テストの目的】
     * - ビジネスルールが守られない場合に、適切にエラー処理されるか検証
     * - システムが不正な状態にならないことを保証
     *
     * 【検証すべきビジネスルール】
     * 1. 残高不足の送金は失敗する
     * 2. 限度額を超える送金はエラーになる
     */
    describe("❌ 異常系: 送金が失敗する（ビジネスルール違反）", () => {
        /**
         * テストケース: 残高不足の場合、送金に失敗する
         *
         * 【シナリオ】
         * - 送金元: 残高1000円
         * - 送金額: 2000円（残高を超える）
         * - 期待結果: 送金失敗（false）、残高は変わらない
         */
        it("残高不足の場合、送金に失敗する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(2000); // 残高以上

            // 送金元アカウント（残高1000円しかない）
            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(1000),
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act =====
            await expect(
                sendMoneyService.sendMoney(command)
            ).rejects.toThrow(InsufficientBalanceException);

            // ===== Assert =====

            // 1. 送金が失敗したか

            // 2. updateActivities は呼ばれない（送金失敗のため）
            // 【重要】DBに不正なデータが書き込まれないことを保証
            expect(mockUpdateAccountStatePort.updateActivities).not.toHaveBeenCalled();

            // 3. ロックは取得・解放される（失敗しても必ず実行）
            // 【検証ポイント】失敗時もリソースリークが発生しない
            expect(mockAccountLock.lockAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);

            // 4. 残高は変わっていない
            // 【重要】失敗時はドメインモデルの状態も変更されない
            expect(sourceAccount.calculateBalance().getAmount()).toBe(1000n);
            expect(targetAccount.calculateBalance().getAmount()).toBe(500n);

            // 5. 新しいアクティビティは作成されていない
            // 失敗した取引は記録されない
            expect(sourceAccount.getNewActivities()).toHaveLength(0);
            expect(targetAccount.getNewActivities()).toHaveLength(0);
        });

        it("限度額を超えた場合、ThresholdExceededExceptionが発生する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(2000000); // 限度額(1000000)を超える

            // アカウントは十分な残高を持つ（限度額の問題であることを明確にするため）
            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(3000000), // 送金額より多い残高
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act & Assert =====
            await expect(
                sendMoneyService.sendMoney(command)
            ).rejects.toThrow(ThresholdExceededException);

            // ✅ 変更: ドメインサービスでチェックされるため、アカウント読み込みとロック取得は実行される
            expect(mockLoadAccountPort.loadAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.lockAccount).toHaveBeenCalledTimes(2);

            // エラーが発生したため、updateActivities は呼ばれない
            expect(mockUpdateAccountStatePort.updateActivities).not.toHaveBeenCalled();

            // ✅ 追加: finally句でロックは必ず解放される
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
        });

        it("限度額を1円でも超えたらエラー", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(1000001); // 限度額より1円多い

            // ✅ 追加: アカウントのモックを設定
            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(2000000), // 十分な残高
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act & Assert =====
            const error = await sendMoneyService
                .sendMoney(command)
                .catch((e) => e);

            // 例外の型を確認
            expect(error).toBeInstanceOf(ThresholdExceededException);

            // 例外オブジェクトのプロパティを検証
            expect(error.threshold.getAmount()).toBe(1000000n);
            expect(error.actual.getAmount()).toBe(1000001n);

            // ✅ 追加: ロックの取得と解放を確認
            expect(mockAccountLock.lockAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
        });
    });

    // ========================================
    // 異常系テスト: データ不整合
    // ========================================

    /**
     * 異常系テスト: データ不整合
     *
     * 【テストの目的】
     * - データベースや外部システムの不整合に対する防御的プログラミングを検証
     * - システムが予期しない状態でクラッシュしないことを保証
     *
     * 【検証すべき異常状態】
     * 1. アカウントが存在しない
     * 2. データの整合性が取れていない（IDなしのアカウント等）
     */
    describe("❌ 異常系: データ不整合", () => {
        /**
         * テストケース: 送金元アカウントが存在しない場合、エラーが発生する
         *
         * 【シナリオ】
         * - loadAccount がエラーをスロー（アカウントが見つからない）
         * - 期待結果: エラーが適切に伝播する
         */
        it("送金元アカウントが存在しない場合、エラーが発生する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(500);

            // loadAccount がエラーをスロー
            // 【シミュレーション】DBにアカウントが存在しない状況
            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockRejectedValueOnce(new Error("Account not found"));

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act & Assert =====
            await expect(
                sendMoneyService.sendMoney(command)
            ).rejects.toThrow("Account not found");

            // エラーが発生したため、以降の処理は実行されない
            // 【検証ポイント】エラー発生時に不要な処理が実行されない
            expect(mockAccountLock.lockAccount).not.toHaveBeenCalled();
            expect(mockUpdateAccountStatePort.updateActivities).not.toHaveBeenCalled();
        });

        /**
         * テストケース: IDなしのアカウントが返された場合、エラーが発生する
         *
         * 【目的】
         * - データの整合性チェックが機能することを確認
         * - 防御的プログラミング（IDが必須であることの検証）
         *
         * 【なぜこのテストが必要か】
         * - 通常はありえないが、バグやデータ破損で発生する可能性がある
         * - 早期にエラーを検出することで、データ不整合の拡大を防ぐ
         */
        it("IDなしのアカウントが返された場合、エラーが発生する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(500);

            // IDなしのアカウント（通常はありえないが、防御的にテスト）
            // Account.withoutId: 新規作成直後のアカウント（まだDBに保存されていない）
            const sourceAccount = Account.withoutId(
                Money.of(1000),
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act & Assert =====
            await expect(
                sendMoneyService.sendMoney(command)
            ).rejects.toThrow("Expected account ID not to be empty");

            // ロックは取得されない
            // 【理由】IDチェックはロック取得前に行われる
            expect(mockAccountLock.lockAccount).not.toHaveBeenCalled();
        });
    });

    // ========================================
    // 異常系テスト: インフラエラー
    // ========================================

    /**
     * 異常系テスト: インフラエラー（ロック解放の保証）
     *
     * 【テストの目的】
     * - インフラ層でエラーが発生しても、リソースリークが起きないことを保証
     * - finally句によるリソース解放が正しく機能することを検証
     *
     * 【検証すべきこと】
     * - エラー発生時もロックが必ず解放される
     * - リソースリーク（ロックの取りっぱなし）が発生しない
     */
    describe("❌ 異常系: インフラエラー（ロック解放の保証）", () => {
        /**
         * テストケース: updateActivities がエラーを投げても、ロックは解放される
         *
         * 【シナリオ】
         * - 送金処理は成功
         * - DB更新時にエラー発生（ネットワーク障害等）
         * - 期待結果: エラーはスローされるが、ロックは必ず解放される
         */
        it("updateActivities がエラーを投げても、ロックは解放される", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(500);

            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(1000),
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            // updateActivities でエラーを発生させる
            // 【シミュレーション】DB接続エラー
            vi.mocked(mockUpdateAccountStatePort.updateActivities)
                .mockRejectedValue(new Error("Database connection failed"));

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act & Assert =====
            await expect(
                sendMoneyService.sendMoney(command)
            ).rejects.toThrow("Database connection failed");

            // ロックは必ず解放される（finally句の動作確認）
            // 【重要】エラーが発生しても、finally句は必ず実行される
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledWith(sourceAccountId);
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledWith(targetAccountId);
        });

        /**
         * テストケース: 1回目のupdateActivitiesで失敗しても、ロックは解放される
         *
         * 【目的】
         * - 複数回のDB更新のうち、途中で失敗した場合の動作を検証
         * - 部分的な成功状態でのリソース管理を確認
         */
        it("1回目のupdateActivitiesで失敗しても、ロックは解放される", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(500);

            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(1000),
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            // 1回目の呼び出しで失敗
            // 【検証ポイント】2回目は呼ばれないが、ロックは解放される
            vi.mocked(mockUpdateAccountStatePort.updateActivities)
                .mockRejectedValueOnce(new Error("Network timeout"));

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act & Assert =====
            await expect(
                sendMoneyService.sendMoney(command)
            ).rejects.toThrow("Network timeout");

            // updateActivities は1回だけ呼ばれる（2回目は呼ばれない）
            // 【理由】1回目でエラーが発生したため、2回目の更新は試行されない
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenCalledTimes(1);

            // ロックは解放される
            // 【検証ポイント】途中でエラーが発生しても、リソースは確実に解放される
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
        });
    });

    // ========================================
    // エッジケーステスト
    // ========================================

    // ========================================
// エッジケーステスト
// ========================================

    /**
     * エッジケーステスト
     *
     * 【テストの目的】
     * - 境界値や特殊な状況での動作を検証
     * - 「極端な」ケースでもシステムが正常に動作することを保証
     *
     * 【エッジケースとは】
     * - 0円の送金（許可されない）
     * - 同一アカウント間の送金
     * - 非常に大きな金額
     * など、通常の使用では稀だが起こりうる状況
     */
    describe("🔍 エッジケース", () => {
        /**
         * テストケース: 0円送金はバリデーションエラーになる
         *
         * 【目的】
         * - 0円の送金が正しく拒否されるか検証
         * - SendMoneyCommand のバリデーションが機能することを確認
         *
         * 【ビジネスルール】
         * - 送金額は必ず正の値（1円以上）でなければならない
         * - 0円送金は無意味なため、コマンド作成時点で拒否
         *
         * 【なぜ重要か】
         * - 「ゼロ」は特殊な値で、バグが起きやすい
         * - 早期バリデーション（Fail Fast）の確認
         */
        it("0円送金はバリデーションエラーになる", () => {
            // ===== Arrange =====
            const transferAmount = Money.of(0);

            // ===== Act & Assert =====
            // SendMoneyCommand のコンストラクタでバリデーションエラーが発生
            expect(() => {
                new SendMoneyCommand(
                    sourceAccountId,
                    targetAccountId,
                    transferAmount
                );
            }).toThrow("money must be positive");

            // コマンド作成時点で弾かれるため、以下は呼ばれない
            // 【検証ポイント】無効なコマンドは早期に拒否される（Fail Fast原則）
        });

        /**
         * テストケース: 負の金額もバリデーションエラーになる
         *
         * 【目的】
         * - 負の金額が正しく拒否されるか検証
         * - バリデーションの完全性を確認
         */
        it("負の金額はバリデーションエラーになる", () => {
            // ===== Arrange =====
            // Money.of(-100) が許可されるかどうかによるが、
            // もし許可される場合は、SendMoneyCommand で弾かれることを確認

            // ===== Act & Assert =====
            expect(() => {
                // 負の金額でコマンドを作成しようとする
                new SendMoneyCommand(
                    sourceAccountId,
                    targetAccountId,
                    Money.of(-100)
                );
            }).toThrow();
        });
        /**
         * テストケース: 最小送金額（1円）でも送金できる
         *
         * 【目的】
         * - 最小の正の値（1円）で送金が成功することを確認
         * - 境界値テスト（0円はNG、1円はOK）
         */
        it("最小送金額（1円）でも送金できる", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(1); // 最小の正の値

            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(1000), // 十分な残高
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(0),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act =====
            await sendMoneyService.sendMoney(command);

            // ===== Assert =====
            // 残高の確認
            expect(sourceAccount.calculateBalance().getAmount()).toBe(999n); // 1000 - 1
            expect(targetAccount.calculateBalance().getAmount()).toBe(1n);   // 0 + 1
        });
    });

    describe("📤 イベント発行の検証", () => {
        it("送金成功時にMoneyTransferredEventが発行される", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(500);

            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(1000),
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act =====
            await sendMoneyService.sendMoney(command);

            // ===== Assert =====

            // 1. EventStoreのsaveが呼ばれたか
            expect(mockEventStore.save).toHaveBeenCalledTimes(1);

            // 2. 実際に保存されたイベントを取り出す（型アサーションを追加）
            //
            // mock.calls の構造:
            // [
            //   [引数1, 引数2, ...],  ← calls[0] = 1回目の呼び出し
            //   [引数1, 引数2, ...],  ← calls[1] = 2回目の呼び出し
            // ]
            //
            // calls[0][0] = 1回目の呼び出しの1番目の引数
            const savedEvent = vi.mocked(mockEventStore.save).mock.calls[0][0] as MoneyTransferredEvent;

            // 3. イベントのプロパティを個別に検証
            expect(savedEvent).toBeInstanceOf(MoneyTransferredEvent);
            expect(savedEvent.eventType).toBe("MoneyTransferred");

            // 4. AccountId の検証（値オブジェクトなので、getValue() で値を取得）
            expect(savedEvent.sourceAccountId.getValue()).toBe(1n);
            expect(savedEvent.targetAccountId.getValue()).toBe(2n);

            // 5. Money の検証
            expect(savedEvent.amount.getAmount()).toBe(500n);

            // 6. イベントIDが生成されているか（UUIDの形式チェック）
            expect(savedEvent.eventId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            );

            // 7. タイムスタンプが設定されているか
            expect(savedEvent.occurredOn).toBeInstanceOf(Date);
        });
    });

    describe("🛡️ EventBusの堅牢性", () => {
        /**
         * テストケース: EventStore保存失敗でも送金は成功する
         *
         * 【目的】
         * - イベントストアの障害が送金処理を止めないことを確認
         * - システムの可用性を保証
         *
         * 【ビジネス要件】
         * - 送金処理は最優先（イベントログは副次的）
         * - イベントストア障害時も送金を継続すべき
         * - ただしエラーはログに記録される
         */
        it("EventStore保存失敗でも送金は成功する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(500);

            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(1000),
                new ActivityWindow()
            );

            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)
                .mockResolvedValueOnce(targetAccount);

            // EventStoreの保存を失敗させる
            vi.mocked(mockEventStore.save).mockRejectedValueOnce(
                new Error("EventStore connection failed")
            );

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act =====
            // エラーをスローせずに完了することを確認
            await expect(
                sendMoneyService.sendMoney(command)
            ).resolves.not.toThrow();

            // ===== Assert =====

            // 1. EventStore保存は試行された
            expect(mockEventStore.save).toHaveBeenCalledTimes(1);

            // 2. 送金処理自体は成功している
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenCalledTimes(2);

            // 3. 残高が正しく更新されている
            expect(sourceAccount.calculateBalance().getAmount()).toBe(500n);
            expect(targetAccount.calculateBalance().getAmount()).toBe(1000n);

            // 4. ロックは正しく解放されている
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
        });
    });

    // ========================================
    // シナリオテスト
    // ========================================

    /**
     * シナリオテスト
     *
     * 【テストの目的】
     * - 実際のビジネスシナリオに近い形でテスト
     * - 「ストーリー」として理解しやすいテストケース
     *
     * 【シナリオテストの特徴】
     * - 変数名を実際のユーザー名に近づける（Alice, Bob等）
     * - 金額を現実的な値にする
     * - テストコードを読めば、ビジネス要件が理解できる
     */
    describe("📖 実践的なシナリオ", () => {
        /**
         * テストケース: 実際の送金シナリオ
         *
         * 【シナリオ】
         * - Alice（残高10000円）が Bob に3000円送金
         * - 期待結果:
         *   - Alice の残高: 7000円
         *   - Bob の残高: 8000円（元の5000円 + 3000円）
         *
         * 【このテストの価値】
         * - プロダクトオーナーや非技術者でも理解できる
         * - 実際のユースケースをそのままテストコードで表現
         * - ドキュメントとしての役割も果たす
         */
        it("シナリオ: Alice (残高10000円) が Bob に 3000円送金", async () => {
            // ===== Arrange =====
            // アカウントIDの定義
            // Alice: ID 100
            const aliceId = new AccountId(100n);
            // Bob: ID 200
            const bobId = new AccountId(200n);
            // 送金額: 3000円
            const transferAmount = Money.of(3000);

            // Alice のアカウント（初期残高: 10000円）
            const aliceAccount = Account.withId(
                aliceId,
                Money.of(10000), // 初期残高
                new ActivityWindow()
            );

            // Bob のアカウント（初期残高: 5000円）
            const bobAccount = Account.withId(
                bobId,
                Money.of(5000), // 初期残高
                new ActivityWindow()
            );

            // モックの設定
            // loadAccount が呼ばれたときの振る舞い
            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(aliceAccount) // 1回目: Alice のアカウント
                .mockResolvedValueOnce(bobAccount);  // 2回目: Bob のアカウント

            // SendMoneyCommand の作成
            // 「Alice から Bob へ 3000円送金」というコマンド
            const command = new SendMoneyCommand(aliceId, bobId, transferAmount);

            // ===== Act =====
            // 送金処理を実行
            await sendMoneyService.sendMoney(command);

            // ===== Assert =====

            // 2. Alice の残高が正しく減っているか
            // 10000 - 3000 = 7000
            expect(aliceAccount.calculateBalance().getAmount()).toBe(7000n);

            // 3. Bob の残高が正しく増えているか
            // 5000 + 3000 = 8000
            expect(bobAccount.calculateBalance().getAmount()).toBe(8000n);

            // 4. 履歴が正しく記録されているか
            // 両方のアカウントに新しいアクティビティ（取引記録）が1件ずつ追加される
            expect(aliceAccount.getNewActivities()).toHaveLength(1);
            expect(bobAccount.getNewActivities()).toHaveLength(1);
        });
    });
});