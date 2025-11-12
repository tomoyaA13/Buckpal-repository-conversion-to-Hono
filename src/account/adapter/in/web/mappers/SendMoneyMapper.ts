import { AccountId } from '../../../../application/domain/model/Activity';
import { Money } from '../../../../application/domain/model/Money';
import { SendMoneyCommand } from '../../../../application/port/in/SendMoneyCommand';
import type { SendMoneyWebRequest } from '../models/SendMoneyWebRequest';
import type { SendMoneyWebResponse } from '../models/SendMoneyWebResponse';

/**
 * Web層とアプリケーション層の間でモデルを変換するマッパー
 *
 * 責務：
 * - Webリクエストをドメインコマンドに変換
 * - ビジネスロジックの結果をWebレスポンスに変換
 */

/**
 * WebリクエストをSendMoneyCommandに変換
 *
 * Web層の文字列データをドメイン層の値オブジェクトに変換
 */
export function toCommand(request: SendMoneyWebRequest): SendMoneyCommand {
    const sourceAccountId = new AccountId(BigInt(request.sourceAccountId));
    const targetAccountId = new AccountId(BigInt(request.targetAccountId));
    const money = Money.of(BigInt(request.amount));

    return new SendMoneyCommand(sourceAccountId, targetAccountId, money);

}

/**
 * 成功レスポンスを作成
 */
export function toSuccessResponse(
    request: SendMoneyWebRequest,
    timestamp: Date = new Date()
): SendMoneyWebResponse {
  return {
    success: true,
    message: 'Money transfer completed successfully',
    data: {
      sourceAccountId: request.sourceAccountId,
      targetAccountId: request.targetAccountId,
      amount: request.amount,
      timestamp: timestamp.toISOString(),
    },
  };
}

/**
 * エラーレスポンスを作成
 */
export function toErrorResponse(
    message: string,
    code: string,
    details?: Record<string, unknown>
): SendMoneyWebResponse {
  return {
    success: false,
    message,
    error: {
      code,
      details,
    },
  };
}