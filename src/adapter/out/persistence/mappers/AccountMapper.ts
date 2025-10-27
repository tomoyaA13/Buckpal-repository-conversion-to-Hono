import {Account} from '../../../../application/domain/model/Account';
import {AccountId, Activity, ActivityId} from '../../../../application/domain/model/Activity';
import {ActivityWindow} from '../../../../application/domain/model/ActivityWindow';
import {Money} from '../../../../application/domain/model/Money';
import type {AccountAggregateRecord} from '../entities/AccountRecord';
import type {ActivityRecord, PersistedActivityRecord} from '../entities/ActivityRecord';

/**
 * 永続化層とドメイン層の間でモデルを変換するマッパー
 *
 * 責務：
 * - DBレコードからドメインモデルへの変換
 * - ドメインモデルからDBレコードへの変換
 *
 * 注意: PersistedActivityRecordはSupabaseの型定義から直接派生するため、
 * Supabaseの生データを変換する必要はない
 */

/*// データベースから取得したデータ
{
  account: { id: 1 },
  activities: [
    {
      id: 101,
      owner_account_id: 1,
      source_account_id: 1,
      target_account_id: 2,
      timestamp: "2024-01-15T10:00:00Z",
      amount: 500
    }
  ],
  baselineBalance: 1000
}

// ↓ toDomain() で変換 ↓

// ドメインモデル
Account {
  id: AccountId(1),
  baselineBalance: Money(1000),
  activityWindow: ActivityWindow [
   Activity {
    id: ActivityId(101),
    ownerAccountId: AccountId(1),
    sourceAccountId: AccountId(1),     // アカウント1から
    targetAccountId: AccountId(2),     // アカウント2へ
    timestamp: Date("2024-01-15T10:00:00Z"),
    money: Money(500)                  // 500円の送金記録
  }
]
}*/

/**
 * DBレコードをドメインモデルに変換(データベースから取得した生データを、ビジネスロジックを持つドメインモデルに変換します。)
 *
 * @param accountAggregateRecord アカウント集約（アカウント + アクティビティ + ベースライン残高）
 * @returns Accountドメインモデル
 */
export function toDomain(accountAggregateRecord: AccountAggregateRecord): Account {
    const accountId = new AccountId(BigInt(accountAggregateRecord.account.id));
    const baselineBalance = Money.of(BigInt(accountAggregateRecord.baselineBalance));

    // アクティビティレコードをドメインモデルに変換
    const activities = accountAggregateRecord.activities.map(activityToDomain)

    const activityWindow = new ActivityWindow(...activities);

    return Account.withId(accountId, baselineBalance, activityWindow);
}

/**
 * ActivityレコードをActivityドメインモデルに変換
 */
function activityToDomain(activityRecord: PersistedActivityRecord): Activity {
    return Activity.withId(
        new ActivityId(BigInt(activityRecord.id)),
        new AccountId(BigInt(activityRecord.owner_account_id)),
        new AccountId(BigInt(activityRecord.source_account_id)),
        new AccountId(BigInt(activityRecord.target_account_id)),
        new Date(activityRecord.timestamp),
        Money.of(BigInt(activityRecord.amount))
    );
}

/**
 * ドメインモデルからDBレコードへの変換
 *
 * 新しいアクティビティのみを抽出してレコードに変換
 * （IDがないアクティビティ = まだDBに保存されていないもの）
 *
 * @param account Accountドメインモデル
 * @returns 挿入すべきActivityレコードの配列
 */
export function toUnpersistedActivityRecords(account: Account): ActivityRecord[] {
    const newActivities = account
        .getActivityWindow()
        .getActivities()
        .filter((activity) => !activity.getId()); // IDがない = 新規アクティビティ

    return newActivities.map(activityToRecord);
}

/**
 * ActivityドメインモデルをActivityレコードに変換
 */
function activityToRecord(activity: Activity): ActivityRecord {
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
export function calculateBaselineBalance(
    activities: PersistedActivityRecord[],
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
