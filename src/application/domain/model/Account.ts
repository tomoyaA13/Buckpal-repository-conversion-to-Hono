import type {AccountId} from './Activity';
import { Activity} from './Activity';
import type {ActivityWindow} from './ActivityWindow';
import type {Money} from './Money';

/**
 * お金を保持するアカウント
 * アグリゲートルート：ビジネスルールを強制する責任を持つ
 *
 * アカウントオブジェクトは最新のアクティビティウィンドウのみを含む
 * 合計残高 = ベースライン残高 + アクティビティウィンドウ内の残高
 */

// Account は以下を集約しています：
// 集約の構成
// Account (集約ルート)
// ├── AccountId (値オブジェクト)
// ├── Money (baselineBalance) (値オブジェクト)
// └── ActivityWindow (エンティティ)
//     └── Activity[] (複数の取引エンティティ)

export class Account {
    private constructor(
        private readonly id: AccountId | null,
        private readonly baselineBalance: Money,
        private readonly activityWindow: ActivityWindow
    ) {
    }

    /**
     * IDなしでアカウントを生成（新規作成時）
     */
    static withoutId(
        baselineBalance: Money,
        activityWindow: ActivityWindow
    ): Account {
        return new Account(null, baselineBalance, activityWindow);
    }

    /**
     * IDありでアカウントを生成（DB再構成時）
     */
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
     * アカウントの合計残高を計算
     * ベースライン残高 + アクティビティウィンドウ内の残高
     */
    calculateBalance(): Money {
        if (!this.id) {
            throw new Error('Cannot calculate balance without account ID');
        }

        return this.baselineBalance.plus(
            this.activityWindow.calculateBalance(this.id)
        );
    }

    /**
     * 指定金額を引き出す（出金）
     * 成功した場合、新しいアクティビティを作成
     *
     * @returns 引き出しが成功したかどうか
     */
    withdraw(money: Money, targetAccountId: AccountId): boolean {
        if (!this.id) {
            throw new Error('Cannot withdraw without account ID');
        }

        if (!this.mayWithdraw(money)) {
            return false;
        }

        const withdrawal = Activity.withoutId(
            this.id,
            this.id,
            targetAccountId,
            new Date(),
            money
        );

        this.activityWindow.addActivity(withdrawal);
        return true;
    }

    /**
     * 引き出しが可能かどうかチェック
     * 残高が0以上になる場合のみ許可
     */
    private mayWithdraw(money: Money): boolean {
        return this.calculateBalance().minus(money).isPositiveOrZero();
    }

    /**
     * 指定金額を預け入れる（入金）
     * 新しいアクティビティを作成
     *
     * @returns 預け入れが成功したかどうか（常にtrue）
     */
    deposit(money: Money, sourceAccountId: AccountId): boolean {
        if (!this.id) {
            throw new Error('Cannot deposit without account ID');
        }

        const deposit = Activity.withoutId(
            this.id,
            sourceAccountId,
            this.id,
            new Date(),
            money
        );

        this.activityWindow.addActivity(deposit);
        return true;
    }
}
