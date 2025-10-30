import { z } from 'zod';
import {SameAccountTransferException} from "../../domain/exception/SameAccountTransferException";
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
 */
export class SendMoneyCommand {
  constructor(
    public readonly sourceAccountId: AccountId,
    public readonly targetAccountId: AccountId,
    public readonly money: Money
  ) {
    // バリデーション
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

    // ✅ 追加: 同一アカウント間の送金を禁止（ビジネスルール）
    if (sourceAccountId.equals(targetAccountId)) {
      throw new SameAccountTransferException(sourceAccountId);
    }

  }
}
