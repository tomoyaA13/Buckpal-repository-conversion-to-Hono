import { describe, it, expect } from "vitest";
import {AccountId, Activity} from "../../src/application/domain/model/Activity";
import {Money} from "../../src/application/domain/model/Money";
import {ActivityWindow} from "../../src/application/domain/model/ActivityWindow";
import {Account} from "../../src/application/domain/model/Account";
import {InsufficientBalanceException} from "../../src/application/domain/exception/InsufficientBalanceException";


describe("Account", () => {
    const accountId = new AccountId(1n);
    const targetAccountId = new AccountId(2n);
    const sourceAccountId = new AccountId(3n);

    it("IDなしでAccountを生成できる", () => {
        // Arrange
        const baselineBalance = Money.of(555);
        const window = new ActivityWindow();

        // Act
        const account = Account.withoutId(baselineBalance, window);

        // Assert
        expect(account.getId()).toBeNull();
        expect(account.getBaselineBalance()).toBe(baselineBalance);
        expect(account.getActivityWindow()).toBe(window);
    });

    it("IDありでAccountを生成できる", () => {
        // Arrange
        const baselineBalance = Money.of(555);
        const window = new ActivityWindow();

        // Act
        const account = Account.withId(accountId, baselineBalance, window);

        // Assert
        expect(account.getId()).toBe(accountId);
        expect(account.getBaselineBalance()).toBe(baselineBalance);
        expect(account.getActivityWindow()).toBe(window);
    });

    it("残高を正しく計算できる", () => {
        // Arrange
        const baselineBalance = Money.of(555);

        // accountIdへの入金100、accountIdからの出金50
        const deposit = Activity.withoutId(
            accountId,
            sourceAccountId,
            accountId,
            new Date(),
            Money.of(100)
        );
        const withdrawal = Activity.withoutId(
            accountId,
            accountId,
            targetAccountId,
            new Date(),
            Money.of(50)
        );

        const window = new ActivityWindow(deposit, withdrawal);
        const account = Account.withId(accountId, baselineBalance, window);

        // Act
        const balance = account.calculateBalance();

        // Assert
        expect(balance.getAmount()).toBe(605n); // 555 + 100 - 50 = 605
    });

    it("IDなしのAccountでcalculateBalance()を呼ぶとエラー", () => {
        // Arrange
        const account = Account.withoutId(Money.of(100), new ActivityWindow());

        // Act & Assert
        expect(() => account.calculateBalance()).toThrow(
            "Cannot calculate balance without account ID"
        );
    });

    it("残高が十分な場合、出金に成功する", () => {
        // Arrange
        const baselineBalance = Money.of(555);
        const window = new ActivityWindow();
        const account = Account.withId(accountId, baselineBalance, window);

        // Act
        // ✅ 修正: withdraw() は void を返す（成功時は例外を投げない）
        account.withdraw(Money.of(100), targetAccountId);

        // Assert
        expect(account.getActivityWindow().getActivities()).toHaveLength(1);

        // 残高確認: 555 - 100 = 455
        expect(account.calculateBalance().getAmount()).toBe(455n);
    });

    it("残高が不足している場合、出金に失敗する", () => {
        // Arrange
        const baselineBalance = Money.of(100);
        const window = new ActivityWindow();
        const account = Account.withId(accountId, baselineBalance, window);

        // Act & Assert
        // ✅ 修正: 例外が throw されることを期待
        expect(() => {
            account.withdraw(Money.of(200), targetAccountId);
        }).toThrow(InsufficientBalanceException);

        // アクティビティは作成されない（例外が投げられたため）
        expect(account.getActivityWindow().getActivities()).toHaveLength(0);

        // 残高は変わらない
        expect(account.calculateBalance().getAmount()).toBe(100n);
    });

    it("残高ちょうどの金額は出金できる", () => {
        // Arrange
        const baselineBalance = Money.of(100);
        const window = new ActivityWindow();
        const account = Account.withId(accountId, baselineBalance, window);

        // Act
        // ✅ 修正: withdraw() は void を返す
        account.withdraw(Money.of(100), targetAccountId);

        // Assert
        expect(account.calculateBalance().getAmount()).toBe(0n);
    });

    it("IDなしのAccountでwithdraw()を呼ぶとエラー", () => {
        // Arrange
        const account = Account.withoutId(Money.of(100), new ActivityWindow());

        // Act & Assert
        expect(() => account.withdraw(Money.of(50), targetAccountId)).toThrow(
            "Cannot withdraw without account ID"
        );
    });

    it("入金に成功する", () => {
        // Arrange
        const baselineBalance = Money.of(555);
        const window = new ActivityWindow();
        const account = Account.withId(accountId, baselineBalance, window);

        // Act
        // ✅ 修正: deposit() は void を返す
        account.deposit(Money.of(100), sourceAccountId);

        // Assert
        expect(account.getActivityWindow().getActivities()).toHaveLength(1);

        // 残高確認: 555 + 100 = 655
        expect(account.calculateBalance().getAmount()).toBe(655n);
    });

    it("IDなしのAccountでdeposit()を呼ぶとエラー", () => {
        // Arrange
        const account = Account.withoutId(Money.of(100), new ActivityWindow());

        // Act & Assert
        expect(() => account.deposit(Money.of(50), sourceAccountId)).toThrow(
            "Cannot deposit without account ID"
        );
    });

    it("新規アクティビティ（IDなし）のみを取得できる", () => {
        // Arrange
        const baselineBalance = Money.of(555);
        const window = new ActivityWindow();
        const account = Account.withId(accountId, baselineBalance, window);

        // Activityを2つ追加
        account.deposit(Money.of(100), sourceAccountId);
        account.withdraw(Money.of(50), targetAccountId);

        // Act
        const newActivities = account.getNewActivities();

        // Assert
        expect(newActivities).toHaveLength(2);
        expect(newActivities[0].getId()).toBeNull();
        expect(newActivities[1].getId()).toBeNull();
    });

    it("複数回の入金と出金を処理できる", () => {
        // Arrange
        const baselineBalance = Money.of(1000);
        const window = new ActivityWindow();
        const account = Account.withId(accountId, baselineBalance, window);

        // Act: 複数の取引を実行
        account.deposit(Money.of(200), sourceAccountId);  // 1000 + 200 = 1200
        account.withdraw(Money.of(100), targetAccountId); // 1200 - 100 = 1100
        account.deposit(Money.of(50), sourceAccountId);   // 1100 + 50 = 1150
        account.withdraw(Money.of(300), targetAccountId); // 1150 - 300 = 850

        // Assert
        expect(account.calculateBalance().getAmount()).toBe(850n);
        expect(account.getActivityWindow().getActivities()).toHaveLength(4);
    });

    // ========================================
    // 【新規追加】nullable対応のテスト
    // ========================================

    describe("外部入金・外部出金のテスト", () => {
        it("外部からの入金（source=null）を処理できる", () => {
            // Arrange
            const baselineBalance = Money.of(100);

            // 外部からの入金アクティビティ（給与、ATM入金など）
            const externalDeposit = Activity.withoutId(
                accountId,
                null,  // ← 外部から
                accountId,
                new Date(),
                Money.of(500)
            );

            const window = new ActivityWindow(externalDeposit);
            const account = Account.withId(accountId, baselineBalance, window);

            // Act
            const balance = account.calculateBalance();

            // Assert
            expect(balance.getAmount()).toBe(600n); // 100 + 500 = 600
            expect(externalDeposit.isExternalDeposit()).toBe(true);
            expect(externalDeposit.isExternalWithdrawal()).toBe(false);
            expect(externalDeposit.isTransfer()).toBe(false);
        });

        it("外部への出金（target=null）を処理できる", () => {
            // Arrange
            const baselineBalance = Money.of(1000);

            // 外部への出金アクティビティ（ATM出金、手数料など）
            const externalWithdrawal = Activity.withoutId(
                accountId,
                accountId,
                null,  // ← 外部へ
                new Date(),
                Money.of(200)
            );

            const window = new ActivityWindow(externalWithdrawal);
            const account = Account.withId(accountId, baselineBalance, window);

            // Act
            const balance = account.calculateBalance();

            // Assert
            expect(balance.getAmount()).toBe(800n); // 1000 - 200 = 800
            expect(externalWithdrawal.isExternalDeposit()).toBe(false);
            expect(externalWithdrawal.isExternalWithdrawal()).toBe(true);
            expect(externalWithdrawal.isTransfer()).toBe(false);
        });

        it("アカウント間送金はisTransfer()がtrueになる", () => {
            // Arrange
            const transfer = Activity.withoutId(
                accountId,
                accountId,
                targetAccountId,
                new Date(),
                Money.of(100)
            );

            // Assert
            expect(transfer.isExternalDeposit()).toBe(false);
            expect(transfer.isExternalWithdrawal()).toBe(false);
            expect(transfer.isTransfer()).toBe(true);
        });

        it("source と target の両方が null の場合はエラー", () => {
            // Act & Assert
            expect(() => {
                Activity.withoutId(
                    accountId,
                    null,  // ← 両方null
                    null,  // ← 両方null
                    new Date(),
                    Money.of(100)
                );
            }).toThrow("At least one of sourceAccountId or targetAccountId must be non-null");
        });

        it("外部入金と外部出金を組み合わせて処理できる", () => {
            // Arrange
            const baselineBalance = Money.of(500);

            const externalDeposit = Activity.withoutId(
                accountId,
                null,
                accountId,
                new Date(),
                Money.of(1000)
            );

            const transfer = Activity.withoutId(
                accountId,
                accountId,
                targetAccountId,
                new Date(),
                Money.of(300)
            );

            const externalWithdrawal = Activity.withoutId(
                accountId,
                accountId,
                null,
                new Date(),
                Money.of(100)
            );

            const window = new ActivityWindow(
                externalDeposit,
                transfer,
                externalWithdrawal
            );
            const account = Account.withId(accountId, baselineBalance, window);

            // Act
            const balance = account.calculateBalance();

            // Assert
            // 500 (baseline) + 1000 (外部入金) - 300 (送金) - 100 (外部出金) = 1100
            expect(balance.getAmount()).toBe(1100n);
        });
    });
});