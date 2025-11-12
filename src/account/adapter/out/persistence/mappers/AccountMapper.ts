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
 *
 * 【nullable対応】
 * - source_account_id が null の場合: 外部からの入金
 * - target_account_id が null の場合: 外部への出金
 */
function activityToDomain(activityRecord: PersistedActivityRecord): Activity {
    return Activity.withId(
        new ActivityId(BigInt(activityRecord.id)),
        new AccountId(BigInt(activityRecord.owner_account_id)),
        activityRecord.source_account_id !== null
            ? new AccountId(BigInt(activityRecord.source_account_id))
            : null,  // ← nullable対応
        activityRecord.target_account_id !== null
            ? new AccountId(BigInt(activityRecord.target_account_id))
            : null,  // ← nullable対応
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
 *
 * 【nullable対応】
 * - sourceAccountId が null の場合: source_account_id を null に
 * - targetAccountId が null の場合: target_account_id を null に
 */
function activityToRecord(activity: Activity): ActivityRecord {
    return {
        // idは自動採番されるため、指定しない
        timestamp: activity.getTimestamp().toISOString(),
        owner_account_id: Number(activity.getOwnerAccountId().getValue()),
        source_account_id: activity.getSourceAccountId() !== null
            ? Number(activity.getSourceAccountId()?.getValue())
            : null,  // ← nullable対応
        target_account_id: activity.getTargetAccountId() !== null
            ? Number(activity.getTargetAccountId()?.getValue())
            : null,  // ← nullable対応
        amount: Number(activity.getMoney().getAmount()),
    };
}

/**
 * ベースライン残高を計算するためのヘルパー
 *
 * 【nullable対応版】
 * - source が null: 外部からの入金 → 加算
 * - target が null: 外部への出金 → 減算
 * - source と target が両方存在: アカウント間送金
 *   - target が自分: 入金 → 加算
 *   - source が自分: 出金 → 減算
 *   - source と target が両方自分: 同一アカウント送金 → 相殺
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
        // 自分のアクティビティでない場合はスキップ
        if (activity.owner_account_id !== accountId) {
            continue;
        }

        const isTarget = activity.target_account_id === accountId;
        const isSource = activity.source_account_id === accountId;

        // 【パターン1】入金：target が自分
        if (isTarget) {
            // 同一アカウント送金の場合は相殺（source と target が両方自分）
            if (isSource) {
                continue; // ±0（次のループへ）
            }
            // 外部入金 or 他人からの送金
            balance += BigInt(activity.amount);
            continue;
        }

        // 【パターン2】出金：source が自分
        if (isSource) {
            // 外部出金 or 他人への送金
            balance -= BigInt(activity.amount);
            continue;
        }

        // 【パターン3】どちらでもない（エラーケース）
        // owner_account_id が自分なのに、source も target も自分でない
        console.warn('Invalid activity detected in calculateBaselineBalance:', activity);
    }

    return balance;
}