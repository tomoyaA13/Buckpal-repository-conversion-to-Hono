import { Account } from '../../../../application/domain/model/Account';
import { AccountId, Activity, ActivityId } from '../../../../application/domain/model/Activity';
import { ActivityWindow } from '../../../../application/domain/model/ActivityWindow';
import { Money } from '../../../../application/domain/model/Money';
import { AccountAggregateEntity } from '../entities/AccountEntity';
import { ActivityEntity, PersistedActivityEntity } from '../entities/ActivityEntity';

/**
 * 永続化層とドメイン層の間でモデルを変換するマッパー
 * 
 * 責務：
 * - DBエンティティからドメインモデルへの変換
 * - ドメインモデルからDBエンティティへの変換
 * - Supabaseの生データからDBエンティティへの変換
 */
export class AccountMapper {
  /**
   * Supabaseから取得した生データをPersistedActivityEntityに変換
   * データベース層の型変換を担当
   * 
   * @param dbRow Supabaseから取得した行データ
   * @returns PersistedActivityEntity
   */
  static toPersistedActivityEntity(dbRow: any): PersistedActivityEntity {
    return {
      id: dbRow.id,
      timestamp: dbRow.timestamp,
      owner_account_id: dbRow.owner_account_id,
      source_account_id: dbRow.source_account_id,
      target_account_id: dbRow.target_account_id,
      amount: dbRow.amount,
    };
  }
  /**
   * DBエンティティをドメインモデルに変換
   * 
   * @param aggregate アカウント集約（アカウント + アクティビティ + ベースライン残高）
   * @returns Accountドメインモデル
   */
  static toDomain(aggregate: AccountAggregateEntity): Account {
    const accountId = new AccountId(BigInt(aggregate.account.id));
    const baselineBalance = Money.of(BigInt(aggregate.baselineBalance));

    // アクティビティエンティティをドメインモデルに変換
    const activities = aggregate.activities.map((activityEntity) =>
      this.activityToDomain(activityEntity)
    );

    const activityWindow = new ActivityWindow(...activities);

    return Account.withId(accountId, baselineBalance, activityWindow);
  }

  /**
   * ActivityエンティティをActivityドメインモデルに変換
   */
  private static activityToDomain(entity: PersistedActivityEntity): Activity {
    return Activity.withId(
      new ActivityId(BigInt(entity.id)),
      new AccountId(BigInt(entity.owner_account_id)),
      new AccountId(BigInt(entity.source_account_id)),
      new AccountId(BigInt(entity.target_account_id)),
      new Date(entity.timestamp),
      Money.of(BigInt(entity.amount))
    );
  }

  /**
   * ドメインモデルからDBエンティティへの変換
   * 
   * 新しいアクティビティのみを抽出してエンティティに変換
   * （IDがないアクティビティ = まだDBに保存されていないもの）
   * 
   * @param account Accountドメインモデル
   * @returns 挿入すべきActivityエンティティの配列
   */
  static toActivityEntities(account: Account): ActivityEntity[] {
    const newActivities = account
      .getActivityWindow()
      .getActivities()
      .filter((activity) => !activity.getId()); // IDがない = 新規アクティビティ

    return newActivities.map((activity) => this.activityToEntity(activity));
  }

  /**
   * ActivityドメインモデルをActivityエンティティに変換
   */
  private static activityToEntity(activity: Activity): ActivityEntity {
    return {
      // idは自動採番されるため、指定しない
      timestamp: activity.getTimestamp().toISOString(),
      owner_account_id: Number(activity.getOwnerAccountId().getValue()),
      source_account_id: Number(activity.getSourceAccountId().getValue()),
      target_account_id: Number(activity.getTargetAccountId().getValue()),
      amount: Number(activity.getMoney().getAmount()),
    };
  }

  /**
   * ベースライン残高を計算するためのヘルパー
   * 
   * @param activities baselineDate以前のアクティビティ
   * @param accountId 対象アカウントID
   * @returns ベースライン残高
   */
  static calculateBaselineBalance(
    activities: PersistedActivityEntity[],
    accountId: number
  ): bigint {
    let balance = 0n;

    for (const activity of activities) {
      if (activity.owner_account_id !== accountId) {
        continue;
      }

      // 入金の場合は加算
      if (activity.target_account_id === accountId) {
        balance += BigInt(activity.amount);
      }

      // 出金の場合は減算
      if (activity.source_account_id === accountId) {
        balance -= BigInt(activity.amount);
      }
    }

    return balance;
  }
}
