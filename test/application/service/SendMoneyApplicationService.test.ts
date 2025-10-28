import "reflect-metadata"

import { describe, it, expect, beforeEach, vi } from "vitest";
import { container } from "tsyringe";
import { SendMoneyApplicationService } from "../../../src/application/service/SendMoneyApplicationService";
import { SendMoneyCommand } from "../../../src/application/port/in/SendMoneyCommand";
import { SendMoneyUseCaseToken } from "../../../src/application/port/in/SendMoneyUseCase";
import { LoadAccountPort, LoadAccountPortToken } from "../../../src/application/port/out/LoadAccountPort";
import { UpdateAccountStatePort, UpdateAccountStatePortToken } from "../../../src/application/port/out/UpdateAccountStatePort";
import { AccountLock, AccountLockToken } from "../../../src/application/port/out/AccountLock";
import { MoneyTransferProperties, MoneyTransferPropertiesToken } from "../../../src/application/domain/service/MoneyTransferProperties";
import { SendMoneyDomainService } from "../../../src/application/domain/service/SendMoneyDomainService";
import { ThresholdExceededException } from "../../../src/application/domain/service/ThresholdExceededException";
import { Account } from "../../../src/application/domain/model/Account";
import { AccountId } from "../../../src/application/domain/model/Activity";
import { ActivityWindow } from "../../../src/application/domain/model/ActivityWindow";
import { Money } from "../../../src/application/domain/model/Money";

/**
 * SendMoneyApplicationService の統合テスト
 *
 * テスト戦略:
 * - ポート（LoadAccountPort, UpdateAccountStatePort, AccountLock）はモック
 * - ドメインサービス（SendMoneyDomainService）は実物を使用
 * - ビジネスロジックの流れを検証
 */
describe("SendMoneyApplicationService（統合テスト）", () => {
    // ===== モックの型定義 =====
    let mockLoadAccountPort: LoadAccountPort;
    let mockUpdateAccountStatePort: UpdateAccountStatePort;
    let mockAccountLock: AccountLock;
    let mockMoneyTransferProperties: MoneyTransferProperties;

    // ===== テスト対象のサービス =====
    let sendMoneyService: SendMoneyApplicationService;

    // ===== 共通のテストデータ =====
    const sourceAccountId = new AccountId(1n);
    const targetAccountId = new AccountId(2n);

    beforeEach(() => {
        // ===== DIコンテナをクリーンアップ =====
        container.clearInstances();

        // ===== モックの作成 =====

        // LoadAccountPort のモック
        mockLoadAccountPort = {
            loadAccount: vi.fn(),
        };

        // UpdateAccountStatePort のモック
        mockUpdateAccountStatePort = {
            updateActivities: vi.fn().mockResolvedValue(undefined),
        };

        // AccountLock のモック
        mockAccountLock = {
            lockAccount: vi.fn(),
            releaseAccount: vi.fn(),
        };

        // MoneyTransferProperties のモック（限度額: 100万円）
        mockMoneyTransferProperties = new MoneyTransferProperties(
            Money.of(1000000)
        );

        // ===== DIコンテナにモックとサービスを登録 =====
        container.register(LoadAccountPortToken, {
            useValue: mockLoadAccountPort,
        });

        container.register(UpdateAccountStatePortToken, {
            useValue: mockUpdateAccountStatePort,
        });

        container.register(AccountLockToken, {
            useValue: mockAccountLock,
        });

        container.register(MoneyTransferPropertiesToken, {
            useValue: mockMoneyTransferProperties,
        });

        // SendMoneyDomainService は実物を使う（統合テストのポイント）
        container.register(SendMoneyDomainService, SendMoneyDomainService);

        // テスト対象のサービスを登録
        container.register(SendMoneyUseCaseToken, {
            useClass: SendMoneyApplicationService,
        });

        // ===== テスト対象のサービスを取得 =====
        sendMoneyService = container.resolve(SendMoneyApplicationService);
    });

    // ========================================
    // 正常系テスト
    // ========================================

    describe("✅ 正常系: 送金が成功する", () => {
        it("残高が十分な場合、送金に成功する", async () => {
            // ===== Arrange（準備）=====
            const transferAmount = Money.of(500);

            // 送金元アカウント（残高1000円）
            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(1000),
                new ActivityWindow()
            );

            // 送金先アカウント（残高500円）
            const targetAccount = Account.withId(
                targetAccountId,
                Money.of(500),
                new ActivityWindow()
            );

            // loadAccount が呼ばれたときの振る舞いを設定
            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(sourceAccount)  // 1回目: sourceAccount
                .mockResolvedValueOnce(targetAccount); // 2回目: targetAccount

            // コマンドを作成
            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act（実行）=====
            const result = await sendMoneyService.sendMoney(command);

            // ===== Assert（検証）=====

            // 1. 送金が成功したか
            expect(result).toBe(true);

            // 2. loadAccount が2回呼ばれたか（送金元と送金先）
            expect(mockLoadAccountPort.loadAccount).toHaveBeenCalledTimes(2);
            expect(mockLoadAccountPort.loadAccount).toHaveBeenNthCalledWith(
                1,
                sourceAccountId,
                expect.any(Date)
            );
            expect(mockLoadAccountPort.loadAccount).toHaveBeenNthCalledWith(
                2,
                targetAccountId,
                expect.any(Date)
            );

            // 3. アカウントがロックされたか
            expect(mockAccountLock.lockAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.lockAccount).toHaveBeenNthCalledWith(
                1,
                sourceAccountId
            );
            expect(mockAccountLock.lockAccount).toHaveBeenNthCalledWith(
                2,
                targetAccountId
            );

            // 4. ドメインロジックが正しく実行されたか（残高の変化を確認）
            expect(sourceAccount.calculateBalance().getAmount()).toBe(500n); // 1000 - 500
            expect(targetAccount.calculateBalance().getAmount()).toBe(1000n); // 500 + 500

            // 5. updateActivities が2回呼ばれたか
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenCalledTimes(2);
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenNthCalledWith(
                1,
                sourceAccount
            );
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenNthCalledWith(
                2,
                targetAccount
            );

            // 6. ロックが解放されたか（finally句で実行される）
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.releaseAccount).toHaveBeenNthCalledWith(
                1,
                sourceAccountId
            );
            expect(mockAccountLock.releaseAccount).toHaveBeenNthCalledWith(
                2,
                targetAccountId
            );

            // 7. 新しいアクティビティが作成されたか
            expect(sourceAccount.getNewActivities()).toHaveLength(1);
            expect(targetAccount.getNewActivities()).toHaveLength(1);
        });

        it("限度額ギリギリの金額でも送金できる", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(1000000); // 限度額ちょうど

            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(2000000),
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
            const result = await sendMoneyService.sendMoney(command);

            // ===== Assert =====
            expect(result).toBe(true);
            expect(sourceAccount.calculateBalance().getAmount()).toBe(1000000n);
            expect(targetAccount.calculateBalance().getAmount()).toBe(1000000n);
        });
    });

    // ========================================
    // 異常系テスト: ビジネスルール違反
    // ========================================

    describe("❌ 異常系: 送金が失敗する（ビジネスルール違反）", () => {
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
            const result = await sendMoneyService.sendMoney(command);

            // ===== Assert =====

            // 1. 送金が失敗したか
            expect(result).toBe(false);

            // 2. updateActivities は呼ばれない（送金失敗のため）
            expect(mockUpdateAccountStatePort.updateActivities).not.toHaveBeenCalled();

            // 3. ロックは取得・解放される（失敗しても必ず実行）
            expect(mockAccountLock.lockAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);

            // 4. 残高は変わっていない
            expect(sourceAccount.calculateBalance().getAmount()).toBe(1000n);
            expect(targetAccount.calculateBalance().getAmount()).toBe(500n);

            // 5. 新しいアクティビティは作成されていない
            expect(sourceAccount.getNewActivities()).toHaveLength(0);
            expect(targetAccount.getNewActivities()).toHaveLength(0);
        });

        it("限度額を超えた場合、ThresholdExceededExceptionが発生する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(2000000); // 限度額(1000000)を超える

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act & Assert =====
            await expect(
                sendMoneyService.sendMoney(command)
            ).rejects.toThrow(ThresholdExceededException);

            // 事前チェックで弾かれるため、以下は呼ばれない
            expect(mockLoadAccountPort.loadAccount).not.toHaveBeenCalled();
            expect(mockAccountLock.lockAccount).not.toHaveBeenCalled();
            expect(mockUpdateAccountStatePort.updateActivities).not.toHaveBeenCalled();
        });

        it("限度額を1円でも超えたらエラー", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(1000001); // 限度額より1円多い

            const command = new SendMoneyCommand(
                sourceAccountId,
                targetAccountId,
                transferAmount
            );

            // ===== Act & Assert =====
            const error = await sendMoneyService
                .sendMoney(command)
                .catch((e) => e);

            expect(error).toBeInstanceOf(ThresholdExceededException);
            expect(error.threshold.getAmount()).toBe(1000000n);
            expect(error.actual.getAmount()).toBe(1000001n);
        });
    });

    // ========================================
    // 異常系テスト: データ不整合
    // ========================================

    describe("❌ 異常系: データ不整合", () => {
        it("送金元アカウントが存在しない場合、エラーが発生する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(500);

            // loadAccount がエラーをスロー
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
            expect(mockAccountLock.lockAccount).not.toHaveBeenCalled();
            expect(mockUpdateAccountStatePort.updateActivities).not.toHaveBeenCalled();
        });

        it("IDなしのアカウントが返された場合、エラーが発生する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(500);

            // IDなしのアカウント（通常はありえないが、防御的にテスト）
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
            expect(mockAccountLock.lockAccount).not.toHaveBeenCalled();
        });
    });

    // ========================================
    // 異常系テスト: インフラエラー
    // ========================================

    describe("❌ 異常系: インフラエラー（ロック解放の保証）", () => {
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
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledWith(sourceAccountId);
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledWith(targetAccountId);
        });

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
            expect(mockUpdateAccountStatePort.updateActivities).toHaveBeenCalledTimes(1);

            // ロックは解放される
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
        });
    });

    // ========================================
    // エッジケーステスト
    // ========================================

    describe("🔍 エッジケース", () => {
        it("残高0円から0円送金すると成功する", async () => {
            // ===== Arrange =====
            const transferAmount = Money.of(0);

            const sourceAccount = Account.withId(
                sourceAccountId,
                Money.of(0),
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
            const result = await sendMoneyService.sendMoney(command);

            // ===== Assert =====
            expect(result).toBe(true);
            expect(sourceAccount.calculateBalance().getAmount()).toBe(0n);
            expect(targetAccount.calculateBalance().getAmount()).toBe(0n);
        });

        it("同じアカウント間の送金はロックを2回取得する", async () => {
            // ===== Arrange =====
            const sameAccountId = new AccountId(1n);
            const transferAmount = Money.of(100);

            const account = Account.withId(
                sameAccountId,
                Money.of(1000),
                new ActivityWindow()
            );

            // 両方とも同じアカウントを返す
            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(account)
                .mockResolvedValueOnce(account);

            const command = new SendMoneyCommand(
                sameAccountId,
                sameAccountId,
                transferAmount
            );

            // ===== Act =====
            const result = await sendMoneyService.sendMoney(command);

            // ===== Assert =====
            expect(result).toBe(true);

            // 同じアカウントでも2回ロック・解放される
            expect(mockAccountLock.lockAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.lockAccount).toHaveBeenCalledWith(sameAccountId);

            expect(mockAccountLock.releaseAccount).toHaveBeenCalledTimes(2);
            expect(mockAccountLock.releaseAccount).toHaveBeenCalledWith(sameAccountId);
        });
    });

    // ========================================
    // シナリオテスト
    // ========================================

    describe("📖 実践的なシナリオ", () => {
        it("シナリオ: Aさん(残高10000円)がBさんに3000円送金", async () => {
            // ===== Arrange =====
            const aさん = new AccountId(100n);
            const bさん = new AccountId(200n);
            const 送金額 = Money.of(3000);

            const aさんのアカウント = Account.withId(
                aさん,
                Money.of(10000),
                new ActivityWindow()
            );

            const bさんのアカウント = Account.withId(
                bさん,
                Money.of(5000),
                new ActivityWindow()
            );

            vi.mocked(mockLoadAccountPort.loadAccount)
                .mockResolvedValueOnce(aさんのアカウント)
                .mockResolvedValueOnce(bさんのアカウント);

            const command = new SendMoneyCommand(aさん, bさん, 送金額);

            // ===== Act =====
            const result = await sendMoneyService.sendMoney(command);

            // ===== Assert =====
            expect(result).toBe(true);

            // Aさんの残高: 10000 - 3000 = 7000
            expect(aさんのアカウント.calculateBalance().getAmount()).toBe(7000n);

            // Bさんの残高: 5000 + 3000 = 8000
            expect(bさんのアカウント.calculateBalance().getAmount()).toBe(8000n);

            // 履歴が正しく記録される
            expect(aさんのアカウント.getNewActivities()).toHaveLength(1);
            expect(bさんのアカウント.getNewActivities()).toHaveLength(1);
        });
    });
});