import {zValidator} from '@hono/zod-validator';
import {Hono} from 'hono';
import {container} from 'tsyringe';
import {InsufficientBalanceException} from '../../../application/domain/exception/InsufficientBalanceException';
import {SameAccountTransferException} from '../../../application/domain/exception/SameAccountTransferException';
import {ThresholdExceededException} from '../../../application/domain/exception/ThresholdExceededException';
import type {SendMoneyUseCase} from '../../../application/port/in/SendMoneyUseCase';
import { SendMoneyUseCaseToken} from '../../../application/port/in/SendMoneyUseCase';
import {toCommand, toErrorResponse, toSuccessResponse} from './mappers/SendMoneyMapper';
import {SendMoneyWebRequestSchema} from "./models/SendMoneyWebRequest";

export const sendMoneyRouter = new Hono();

/**
 * POST /api/accounts/send
 * JSONボディで送金リクエストを受け付ける
 */
sendMoneyRouter.post(
    '/accounts/send',
    zValidator('json', SendMoneyWebRequestSchema),
    async (c): Promise<Response> => {
        try {
            // 1. リクエストボディからバリデーション済みデータを取得
            const request = c.req.valid('json');

            // 2. DIコンテナからユースケースを取得
            const sendMoneyUseCase = container.resolve<SendMoneyUseCase>(SendMoneyUseCaseToken);

            // 3. Webリクエストをドメインコマンドに変換
            const command = toCommand(request);

            // 4. ユースケースを実行（例外が発生する可能性がある）
            await sendMoneyUseCase.sendMoney(command);

            // 5. 成功レスポンスを返す
            return c.json(toSuccessResponse(request), 200);

        } catch (error) {
            // ===== ビジネスロジックエラー =====

            // 残高不足
            if (error instanceof InsufficientBalanceException) {
                return c.json(
                    toErrorResponse(
                        'Money transfer failed - insufficient balance',
                        'INSUFFICIENT_BALANCE',
                        {
                            accountId: error.accountId.getValue().toString(),
                            attemptedAmount: error.attemptedAmount.getAmount().toString(),
                            currentBalance: error.currentBalance.getAmount().toString(),
                        }
                    ),
                    400
                );
            }

            // 限度額超過
            if (error instanceof ThresholdExceededException) {
                return c.json(
                    toErrorResponse(
                        'Maximum threshold for money transfer exceeded',
                        'THRESHOLD_EXCEEDED',
                        {
                            threshold: error.threshold.getAmount().toString(),
                            attempted: error.actual.getAmount().toString(),
                        }
                    ),
                    400
                );
            }

            // 同一アカウント送金
            if (error instanceof SameAccountTransferException) {
                return c.json(
                    toErrorResponse(
                        'Cannot transfer money to the same account',
                        'SAME_ACCOUNT_TRANSFER',
                        {
                            accountId: error.accountId.getValue().toString(),
                        }
                    ),
                    400
                );
            }

            // ===== その他のエラー =====

            // 予期しないエラー（インフラエラー、バグ等）
            console.error('Unexpected error:', error);

            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

            return c.json(
                toErrorResponse(
                    errorMessage,
                    'INTERNAL_ERROR'
                ),
                500
            );
        }
    }
);