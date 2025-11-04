import {InsufficientBalanceException} from "../exception/InsufficientBalanceException";
import type {AccountId} from './Activity';
import { Activity} from './Activity';
import type {ActivityWindow} from './ActivityWindow';
import type {Money} from './Money';

export class Account {
    private constructor(
        private readonly id: AccountId | null,
        private readonly baselineBalance: Money,
        private readonly activityWindow: ActivityWindow
    ) {
    }

    static withoutId(
        baselineBalance: Money,
        activityWindow: ActivityWindow
    ): Account {
        return new Account(null, baselineBalance, activityWindow);
    }

    static withId(
        accountId: AccountId,
        baselineBalance: Money,
        activityWindow: ActivityWindow
    ): Account {
        return new Account(accountId, baselineBalance, activityWindow);
    }

    getId(): AccountId | null {
        return this.id;
    }

    getBaselineBalance(): Money {
        return this.baselineBalance;
    }

    getActivityWindow(): ActivityWindow {
        return this.activityWindow;
    }

    /**
     * 新規アクティビティを取得
     *
     * IDがないアクティビティ = まだデータベースに保存されていないアクティビティ
     *
     * ビジネスルール：
     * - アクティビティは作成時にIDを持たない
     * - DBに保存されると自動採番されたIDが付与される
     * - このメソッドは未保存のアクティビティのみを返す
     *
     * @returns 未保存のアクティビティの配列
     */
    getNewActivities(): Activity[] {
        return this.activityWindow
            .getActivities()
            .filter((activity) => !activity.getId());
    }

    calculateBalance(): Money {
        if (!this.id) {
            throw new Error('Cannot calculate balance without account ID');
        }

        return this.baselineBalance.plus(
            this.activityWindow.calculateBalance(this.id)
        );
    }

    /**
     * 出金を実行
     *
     * @throws InsufficientBalanceException 残高不足の場合
     */
    withdraw(money: Money, targetAccountId: AccountId): void {
        if (!this.id) {
            throw new Error('Cannot withdraw without account ID');
        }

        if (!this.mayWithdraw(money)) {
            throw new InsufficientBalanceException(
                this.id,
                money,
                this.calculateBalance()
            );
        }

        const withdrawalActivity = Activity.withoutId(
            this.id,
            this.id,
            targetAccountId,
            new Date(),
            money
        );

        this.activityWindow.addActivity(withdrawalActivity);
    }

    private mayWithdraw(money: Money): boolean {
        return this.calculateBalance().minus(money).isPositiveOrZero();
    }

    deposit(money: Money, sourceAccountId: AccountId): void {
        if (!this.id) {
            throw new Error('Cannot deposit without account ID');
        }

        const depositActivity = Activity.withoutId(
            this.id,
            sourceAccountId,
            this.id,
            new Date(),
            money
        );

        this.activityWindow.addActivity(depositActivity);
    }




}