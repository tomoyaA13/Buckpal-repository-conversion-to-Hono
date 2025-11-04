import { z } from 'zod';

/**
 * Web層専用のリクエストモデル
 * プリミティブ型のみを使用してドメインモデルへの依存を排除
 */
export interface SendMoneyWebRequest {
  sourceAccountId: string;
  targetAccountId: string;
  amount: string;
}

/**
 * JSONボディ用のバリデーションスキーマ
 */
export const SendMoneyWebRequestSchema = z.object({
  sourceAccountId: z.string().regex(/^\d+$/, 'sourceAccountId must be a numeric string'),
  targetAccountId: z.string().regex(/^\d+$/, 'targetAccountId must be a numeric string'),
  amount: z.string().regex(/^\d+$/, 'amount must be a positive numeric string'),
});

/**
 * パスパラメータ用のバリデーションスキーマ
 * （URLパラメータは常に文字列なので、同じバリデーションルールを使用）
 */
export const SendMoneyParamSchema = z.object({
  sourceAccountId: z.string().regex(/^\d+$/, 'sourceAccountId must be a numeric string'),
  targetAccountId: z.string().regex(/^\d+$/, 'targetAccountId must be a numeric string'),
  amount: z.string().regex(/^\d+$/, 'amount must be a positive numeric string'),
});
