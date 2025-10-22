import type {AccountId, Activity} from './Activity';
import {Money} from './Money';

/**
 * アカウントアクティビティのウィンドウ
 * 特定の期間におけるアクティビティの集合を表す
 */
export class ActivityWindow {
    private readonly activities: Activity[];

    constructor(...activities: Activity[]) {
        this.activities = [...activities];
    }

    /**
     * ウィンドウ内の最初のアクティビティのタイムスタンプ
     */
    getStartTimestamp(): Date {
        if (this.activities.length === 0) {
            throw new Error('ActivityWindow is empty');
        }

        return this.activities.reduce((earliest, activity) => {
            return activity.getTimestamp() < earliest
                ? activity.getTimestamp()
                : earliest;
        }, this.activities[0].getTimestamp());
    }

    /**
     * ウィンドウ内の最後のアクティビティのタイムスタンプ
     */
    getEndTimestamp(): Date {
        if (this.activities.length === 0) {
            throw new Error('ActivityWindow is empty');
        }

        return this.activities.reduce((latest, activity) => {
            return activity.getTimestamp() > latest
                ? activity.getTimestamp()
                : latest;
        }, this.activities[0].getTimestamp());
    }

    /**
     * 指定されたアカウントIDに対する残高を計算
     * 入金（targetAccountId）はプラス、出金（sourceAccountId）はマイナス
     */
    calculateBalance(accountId: AccountId): Money {
        const depositBalance = this.activities
            .filter((a) => a.getTargetAccountId().equals(accountId))
            .reduce((sum, a) => sum.plus(a.getMoney()), Money.ZERO);

        const withdrawalBalance = this.activities
            .filter((a) => a.getSourceAccountId().equals(accountId))
            .reduce((sum, a) => sum.plus(a.getMoney()), Money.ZERO);

        return depositBalance.minus(withdrawalBalance);
    }

    /**
     * アクティビティを追加
     */
    addActivity(activity: Activity): void {
        this.activities.push(activity);
    }

    /**
     * アクティビティのリストを取得（変更不可）
     */
    getActivities(): readonly Activity[] {
        return [...this.activities];
    }
}
