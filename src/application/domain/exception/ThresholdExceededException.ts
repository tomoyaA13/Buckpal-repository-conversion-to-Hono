// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ThresholdExceededException（限度額超過例外）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 【この例外クラスの目的】
// - 1回の送金の限度額を超えた場合に投げられる例外
// - ビジネスルール違反を表現する
//
// 【ビジネスルール】
// 例: 「1回の送金は100万円まで」
// → 100万円を超える送金を試みると、この例外が投げられる
//
// 【なぜ限度額が必要？】
// - マネーロンダリング防止
// - 不正利用の防止
// - 法律や規制の遵守
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {Money} from '../model/Money';

/**
 * 送金限度額超過例外
 *
 * 【InsufficientBalanceException との違い】
 *
 * InsufficientBalanceException:
 *   - 「お金が足りない」という物理的な制約
 *   - 残高: 50万円、送金額: 100万円 → 不可能
 *
 * ThresholdExceededException:
 *   - 「ルールで禁止されている」というビジネス上の制約
 *   - 残高: 200万円、送金額: 150万円、限度額: 100万円 → 禁止
 *   - お金はあるけど、ルール違反
 */
export class ThresholdExceededException extends Error {
  /**
   * 設定されている限度額
   *
   * 【例】
   * threshold = Money.of(1000000) // 100万円
   *
   * 【なぜ必要？】
   * - ユーザーに「限度額は100万円です」と伝えられる
   * - 監査ログに記録できる
   */
  public readonly threshold: Money;

  /**
   * 実際に送金しようとした金額
   *
   * 【例】
   * actual = Money.of(1500000) // 150万円
   *
   * 【なぜ必要？】
   * - 「150万円の送金を試みました」とログに記録
   * - どれだけ限度額を超えているかわかる（50万円オーバー）
   */
  public readonly actual: Money;

  /**
   * コンストラクタ
   *
   * 【呼び出し例】
   * if (money.isGreaterThan(threshold)) {
   *     throw new ThresholdExceededException(
   *         Money.of(1000000),  // 限度額: 100万円
   *         Money.of(1500000)   // 試行金額: 150万円
   *     );
   * }
   *
   * @param threshold 設定されている限度額
   * @param actual 実際に送金しようとした金額
   */
  constructor(threshold: Money, actual: Money) {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // super() で親クラス（Error）を初期化
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //
    // エラーメッセージの例:
    // "Maximum threshold exceeded: threshold is 1000000, but tried to send 1500000"
    //
    // 【メッセージ設計のポイント】
    // 1. 何が問題か明確にする（限度額超過）
    // 2. 具体的な数値を含める（100万円 vs 150万円）
    // 3. 英語で統一（国際化を考慮）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    super(
        `Maximum threshold exceeded: ` +
        `threshold is ${threshold.getAmount().toString()}, ` +
        `but tried to send ${actual.getAmount().toString()}`
    );

    // エラーの種類を識別する名前
    this.name = 'ThresholdExceededException';

    // 詳細情報を保存
    this.threshold = threshold;
    this.actual = actual;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 使い方の例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 【ドメインサービスでの使用例】
// SendMoneyDomainService.ts:
//
// executeTransfer(
//     sourceAccount: Account,
//     targetAccount: Account,
//     money: Money,
//     threshold: Money
// ): void {
//     // ビジネスルール: 限度額チェック
//     if (money.isGreaterThan(threshold)) {
//         throw new ThresholdExceededException(threshold, money);
//     }
//     // 送金処理...
// }
//
// 【Web層でのエラーハンドリング】
// SendMoneyController.ts:
//
// try {
//     await sendMoneyUseCase.sendMoney(command);
//     return c.json({ success: true }, 200);
// } catch (error) {
//     if (error instanceof ThresholdExceededException) {
//         return c.json({
//             success: false,
//             message: '送金限度額を超えています',
//             error: {
//                 code: 'THRESHOLD_EXCEEDED',
//                 details: {
//                     threshold: error.threshold.getAmount().toString(),
//                     attempted: error.actual.getAmount().toString(),
//                 }
//             }
//         }, 400);
//     }
// }
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━