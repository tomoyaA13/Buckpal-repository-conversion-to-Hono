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

        /**
         * reduce の詳細な処理の流れ:
         *
         * reduce は配列の各要素を順番に処理し、1つの値に集約するメソッドです。
         *
         * 構文: array.reduce((累積値, 現在の要素) => { ... }, 初期値)
         *
         * この例では:
         * - 初期値: this.activities[0].getTimestamp() （最初のアクティビティのタイムスタンプ）
         * - 累積値の名前: earliest （これまでで最も早いタイムスタンプ）
         * - 現在の要素: activity （今処理しているアクティビティ）
         *
         * 処理の流れ（例：3つのアクティビティがある場合）:
         *
         * 前提: activities = [activity1(2024-01-15), activity2(2024-01-10), activity3(2024-01-20)]
         *
         * 【初期化】
         * earliest = activity1.getTimestamp() = 2024-01-15
         *
         * 【1回目のループ】activity1を処理
         * - earliest (現在の値) = 2024-01-15
         * - activity (現在の要素) = activity1(2024-01-15)
         * - 比較: 2024-01-15 < 2024-01-15 → false
         * - 結果: earliest = 2024-01-15 （変わらず）
         *
         * 【2回目のループ】activity2を処理
         * - earliest (現在の値) = 2024-01-15
         * - activity (現在の要素) = activity2(2024-01-10)
         * - 比較: 2024-01-10 < 2024-01-15 → true
         * - 結果: earliest = 2024-01-10 （更新！）
         *
         * 【3回目のループ】activity3を処理
         * - earliest (現在の値) = 2024-01-10
         * - activity (現在の要素) = activity3(2024-01-20)
         * - 比較: 2024-01-20 < 2024-01-10 → false
         * - 結果: earliest = 2024-01-10 （変わらず）
         *
         * 【最終結果】
         * 返り値 = 2024-01-10 （最も早いタイムスタンプ）
         */
        return this.activities.reduce((earliest, activity) => {
            return activity.getTimestamp() < earliest
                ? activity.getTimestamp()  // 今のアクティビティの方が早い → 今のを採用
                : earliest;                // 今までの earliest の方が早い → そのまま
        }, this.activities[0].getTimestamp());
    }

    /**
     * ウィンドウ内の最後のアクティビティのタイムスタンプ
     */
    getEndTimestamp(): Date {
        if (this.activities.length === 0) {
            throw new Error('ActivityWindow is empty');
        }

        /**
         * reduce の詳細な処理の流れ:
         *
         * getStartTimestamp() と同じ仕組みですが、最も「遅い」タイムスタンプを探します。
         *
         * この例では:
         * - 初期値: this.activities[0].getTimestamp()
         * - 累積値の名前: latest （これまでで最も遅いタイムスタンプ）
         * - 現在の要素: activity
         *
         * 処理の流れ（例：3つのアクティビティがある場合）:
         *
         * 前提: activities = [activity1(2024-01-15), activity2(2024-01-10), activity3(2024-01-20)]
         *
         * 【初期化】
         * latest = activity1.getTimestamp() = 2024-01-15
         *
         * 【1回目のループ】activity1を処理
         * - latest (現在の値) = 2024-01-15
         * - activity (現在の要素) = activity1(2024-01-15)
         * - 比較: 2024-01-15 > 2024-01-15 → false
         * - 結果: latest = 2024-01-15 （変わらず）
         *
         * 【2回目のループ】activity2を処理
         * - latest (現在の値) = 2024-01-15
         * - activity (現在の要素) = activity2(2024-01-10)
         * - 比較: 2024-01-10 > 2024-01-15 → false
         * - 結果: latest = 2024-01-15 （変わらず）
         *
         * 【3回目のループ】activity3を処理
         * - latest (現在の値) = 2024-01-15
         * - activity (現在の要素) = activity3(2024-01-20)
         * - 比較: 2024-01-20 > 2024-01-15 → true
         * - 結果: latest = 2024-01-20 （更新！）
         *
         * 【最終結果】
         * 返り値 = 2024-01-20 （最も遅いタイムスタンプ）
         */
        return this.activities.reduce((latest, activity) => {
            return activity.getTimestamp() > latest
                ? activity.getTimestamp()  // 今のアクティビティの方が遅い → 今のを採用
                : latest;                  // 今までの latest の方が遅い → そのまま
        }, this.activities[0].getTimestamp());
    }

    /**
     * 指定されたアカウントIDに対する残高を計算
     * 入金（targetAccountId）はプラス、出金（sourceAccountId）はマイナス
     */
    calculateBalance(accountId: AccountId): Money {
        /**
         * 【入金の合計を計算】
         *
         * reduce の詳細な処理の流れ:
         *
         * この例では:
         * - 初期値: Money.ZERO （0円）
         * - 累積値の名前: sum （これまでの入金の合計金額）
         * - 現在の要素: a （今処理しているアクティビティ）
         *
         * 処理の流れ（例：3つの入金アクティビティがある場合）:
         *
         * 前提:
         * - filter後のactivities = [入金100円, 入金200円, 入金150円]
         * - これらはすべて targetAccountId が指定された accountId と一致
         *
         * 【初期化】
         * sum = Money.ZERO = 0円
         *
         * 【1回目のループ】入金100円を処理
         * - sum (現在の合計) = 0円
         * - a (現在のアクティビティ) = 入金100円
         * - 計算: sum.plus(a.getMoney()) = 0円 + 100円 = 100円
         * - 結果: sum = 100円
         *
         * 【2回目のループ】入金200円を処理
         * - sum (現在の合計) = 100円
         * - a (現在のアクティビティ) = 入金200円
         * - 計算: sum.plus(a.getMoney()) = 100円 + 200円 = 300円
         * - 結果: sum = 300円
         *
         * 【3回目のループ】入金150円を処理
         * - sum (現在の合計) = 300円
         * - a (現在のアクティビティ) = 入金150円
         * - 計算: sum.plus(a.getMoney()) = 300円 + 150円 = 450円
         * - 結果: sum = 450円
         *
         * 【最終結果】
         * depositBalance = 450円 （入金の合計）
         */
        const depositBalance = this.activities
            .filter((a) => a.getTargetAccountId()?.equals(accountId))  // 指定されたアカウントが受取人のアクティビティのみ抽出
            .reduce((sum, a) => sum.plus(a.getMoney()), Money.ZERO);  // 各金額を合計

        /**
         * 【出金の合計を計算】
         *
         * reduce の詳細な処理の流れ:
         *
         * この例では:
         * - 初期値: Money.ZERO （0円）
         * - 累積値の名前: sum （これまでの出金の合計金額）
         * - 現在の要素: a （今処理しているアクティビティ）
         *
         * 処理の流れ（例：2つの出金アクティビティがある場合）:
         *
         * 前提:
         * - filter後のactivities = [出金50円, 出金30円]
         * - これらはすべて sourceAccountId が指定された accountId と一致
         *
         * 【初期化】
         * sum = Money.ZERO = 0円
         *
         * 【1回目のループ】出金50円を処理
         * - sum (現在の合計) = 0円
         * - a (現在のアクティビティ) = 出金50円
         * - 計算: sum.plus(a.getMoney()) = 0円 + 50円 = 50円
         * - 結果: sum = 50円
         *
         * 【2回目のループ】出金30円を処理
         * - sum (現在の合計) = 50円
         * - a (現在のアクティビティ) = 出金30円
         * - 計算: sum.plus(a.getMoney()) = 50円 + 30円 = 80円
         * - 結果: sum = 80円
         *
         * 【最終結果】
         * withdrawalBalance = 80円 （出金の合計）
         */
        const withdrawalBalance = this.activities
            .filter((a) => a.getSourceAccountId()?.equals(accountId))  // 指定されたアカウントが送金元のアクティビティのみ抽出
            .reduce((sum, a) => sum.plus(a.getMoney()), Money.ZERO);  // 各金額を合計

        /**
         * 【最終的な残高計算】
         *
         * 例（上記の例の続き）:
         * - depositBalance = 450円 （入金の合計）
         * - withdrawalBalance = 80円 （出金の合計）
         * - 残高 = 450円 - 80円 = 370円
         *
         * これは「このアカウントの純粋な増減」を表します:
         * - 入金（受け取ったお金）→ プラス
         * - 出金（送ったお金）→ マイナス
         */
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