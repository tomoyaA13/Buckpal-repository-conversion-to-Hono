import { injectable } from 'tsyringe';
import { LoadAccountPort } from '../../../application/port/out/LoadAccountPort';
import { UpdateAccountStatePort } from '../../../application/port/out/UpdateAccountStatePort';
import { Account } from '../../../application/domain/model/Account';
import { AccountId, Activity, ActivityId } from '../../../application/domain/model/Activity';
import { ActivityWindow } from '../../../application/domain/model/ActivityWindow';
import { Money } from '../../../application/domain/model/Money';

/**
 * アカウントデータ（インメモリストア用）
 */
interface AccountData {
  id: bigint;
}

/**
 * アクティビティデータ（インメモリストア用）
 */
interface ActivityData {
  id: bigint;
  timestamp: Date;
  ownerAccountId: bigint;
  sourceAccountId: bigint;
  targetAccountId: bigint;
  amount: bigint;
}

/**
 * インメモリアカウント永続化アダプター
 * 開発・テスト用の簡易実装
 */
@injectable()
export class InMemoryAccountPersistenceAdapter
  implements LoadAccountPort, UpdateAccountStatePort
{
  private accounts: Map<bigint, AccountData> = new Map();
  private activities: ActivityData[] = [];
  private nextActivityId = 1n;

  constructor() {
    // テストデータを初期化
    this.initializeTestData();
  }

  /**
   * テストデータの初期化
   */
  private initializeTestData(): void {
    // アカウント1と2を作成
    this.accounts.set(1n, { id: 1n });
    this.accounts.set(2n, { id: 2n });

    // 初期アクティビティを追加
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    this.activities.push({
      id: this.nextActivityId++,
      timestamp: yesterday,
      ownerAccountId: 1n,
      sourceAccountId: 1n,
      targetAccountId: 2n,
      amount: 500n,
    });

    this.activities.push({
      id: this.nextActivityId++,
      timestamp: yesterday,
      ownerAccountId: 2n,
      sourceAccountId: 1n,
      targetAccountId: 2n,
      amount: 500n,
    });
  }

  /**
   * アカウントをロード
   */
  async loadAccount(accountId: AccountId, baselineDate: Date): Promise<Account> {
    const accountData = this.accounts.get(accountId.getValue());
    if (!accountData) {
      throw new Error(`Account not found: ${accountId.getValue()}`);
    }

    // baselineDate以降のアクティビティを取得
    const activitiesAfterBaseline = this.activities.filter(
      (a) =>
        a.ownerAccountId === accountId.getValue() &&
        a.timestamp >= baselineDate
    );

    // baselineDate以前の残高を計算
    const withdrawalBalance = this.activities
      .filter(
        (a) =>
          a.sourceAccountId === accountId.getValue() &&
          a.ownerAccountId === accountId.getValue() &&
          a.timestamp < baselineDate
      )
      .reduce((sum, a) => sum + a.amount, 0n);

    const depositBalance = this.activities
      .filter(
        (a) =>
          a.targetAccountId === accountId.getValue() &&
          a.ownerAccountId === accountId.getValue() &&
          a.timestamp < baselineDate
      )
      .reduce((sum, a) => sum + a.amount, 0n);

    const baselineBalance = Money.subtract(
      Money.of(depositBalance),
      Money.of(withdrawalBalance)
    );

    // アクティビティをドメインモデルに変換
    const activities = activitiesAfterBaseline.map((a) =>
      Activity.withId(
        new ActivityId(a.id),
        new AccountId(a.ownerAccountId),
        new AccountId(a.sourceAccountId),
        new AccountId(a.targetAccountId),
        a.timestamp,
        Money.of(a.amount)
      )
    );

    return Account.withId(
      accountId,
      baselineBalance,
      new ActivityWindow(...activities)
    );
  }

  /**
   * アカウントのアクティビティを更新
   */
  async updateActivities(account: Account): Promise<void> {
    const newActivities = account
      .getActivityWindow()
      .getActivities()
      .filter((activity) => !activity.getId());

    for (const activity of newActivities) {
      this.activities.push({
        id: this.nextActivityId++,
        timestamp: activity.getTimestamp(),
        ownerAccountId: activity.getOwnerAccountId().getValue(),
        sourceAccountId: activity.getSourceAccountId().getValue(),
        targetAccountId: activity.getTargetAccountId().getValue(),
        amount: activity.getMoney().getAmount(),
      });
    }
  }
}
