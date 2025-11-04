import { z } from 'zod';
import { AccountId } from '../../domain/model/Activity';
import { Money } from '../../domain/model/Money';

/**
 * 送金コマンドのバリデーションスキーマ
 */
const SendMoneyCommandSchema = z.object({
  sourceAccountId: z.custom<AccountId>((val) => val instanceof AccountId, {
    message: 'sourceAccountId must be an AccountId instance',
  }),
  targetAccountId: z.custom<AccountId>((val) => val instanceof AccountId, {
    message: 'targetAccountId must be an AccountId instance',
  }),
  money: z
      .custom<Money>((val) => val instanceof Money, {
        message: 'money must be a Money instance',
      })
      .refine((money) => money.isPositive(), {
        message: 'money must be positive',
      }),
});

/**
 * 送金コマンド
 * 不変オブジェクトとして実装
 *
 * 【責務】
 * - データ構造の妥当性を保証（型チェック、基本的な整合性）
 * - ビジネスルールの検証はドメインサービスに委譲
 */
export class SendMoneyCommand {
  constructor(
      public readonly sourceAccountId: AccountId,
      public readonly targetAccountId: AccountId,
      public readonly money: Money
  ) {
    // データ構造の妥当性を検証
    const result = SendMoneyCommandSchema.safeParse({
      sourceAccountId,
      targetAccountId,
      money,
    });

    if (!result.success) {
      throw new Error(
          `Invalid SendMoneyCommand: ${result.error.issues.map((e) => e.message).join(', ')}`
      );
    }

    // ❌ 削除: 同一アカウント間の送金チェック
    // → ドメインサービス（SendMoneyDomainService）に移動
    // 【理由】
    // - これはビジネスルール（ドメイン知識）
    // - ビジネスの専門家と議論できる内容
    // - 他のビジネスルール（限度額チェック）と統一的に配置
  }
}