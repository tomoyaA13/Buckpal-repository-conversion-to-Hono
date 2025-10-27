// /Users/tomoya/WebstormProjects/Buckpal-repository-conversion-to-Hono/src/adapter/out/persistence/mappers/AccountMapper.ts

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
 * 重要: マッパーは純粋な変換のみを行い、フィルタリングなどのビジネスロジックは含まない
 */

/**
 * DBレコードをドメインモデルに変換
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
 * Activityドメインモデルの配列をActivityレコードの配列に変換
 *
 * 純粋な変換のみを行う。フィルタリングはアダプター側の責務。
 *
 * @param activities Activityドメインモデルの配列
 * @returns ActivityRecordの配列
 */
export function toActivityRecords(activities: Activity[]): ActivityRecord[] {
    return activities.map(activityToRecord);
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