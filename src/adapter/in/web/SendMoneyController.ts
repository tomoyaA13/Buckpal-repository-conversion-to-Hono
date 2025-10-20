import {zValidator} from '@hono/zod-validator';
import {Hono} from 'hono';
import {container} from 'tsyringe';
import {ThresholdExceededException} from '../../../application/domain/service/ThresholdExceededException';
import type {SendMoneyUseCase} from '../../../application/port/in/SendMoneyUseCase';
import {SendMoneyUseCaseToken} from '../../../application/port/in/SendMoneyUseCase';
import {SendMoneyMapper} from './mappers/SendMoneyMapper';
import {SendMoneyWebRequestSchema, SendMoneyParamSchema} from './models/SendMoneyWebRequest';

/**
 * 送金コントローラー（双方向モデル変換版）
 *
 * Web層の責務：
 * 1. HTTPリクエストを受け取る
 * 2. Web層のモデルでバリデーション（zod validator使用）
 * 3. マッパーでドメインモデルに変換
 * 4. ユースケースを実行
 * 5. 結果をWeb層のモデルに変換してレスポンス
 */
export const sendMoneyRouter = new Hono();

/**
 * 送金エンドポイント
 * POST /accounts/send
 *
 * リクエストボディ例：
 * {
 *   "sourceAccountId": "1",
 *   "targetAccountId": "2",
 *   "amount": "1000"
 * }
 */
sendMoneyRouter.post(
    '/accounts/send',
    zValidator('json', SendMoneyWebRequestSchema),
    async (c): Promise<Response> => {
        try {
            // 1. バリデーション済みのデータを取得（型安全）
            const webRequest = c.req.valid('json');

            // 2. Web層のモデルをドメイン層のコマンドに変換
            const command = SendMoneyMapper.toCommand(webRequest);

            // 3. DIコンテナからユースケースを取得して実行
            const sendMoneyUseCase = container.resolve<SendMoneyUseCase>(
                SendMoneyUseCaseToken
            );
            const success = await sendMoneyUseCase.sendMoney(command);

            // 4. 結果をWeb層のレスポンスに変換
            if (success) {
                return c.json(SendMoneyMapper.toSuccessResponse(webRequest));
            } else {
                return c.json(
                    SendMoneyMapper.toErrorResponse(
                        'Money transfer failed - insufficient balance',
                        'INSUFFICIENT_BALANCE'
                    ),
                    400
                );
            }
        } catch (error) {
            // エラーハンドリング
            if (error instanceof ThresholdExceededException) {
                return c.json(
                    SendMoneyMapper.toErrorResponse(
                        error.message,
                        'THRESHOLD_EXCEEDED',
                        {
                            threshold: error.threshold.toString(),
                            attempted: error.actual.toString(),
                        }
                    ),
                    400
                );
            }

            if (error instanceof Error) {
                return c.json(
                    SendMoneyMapper.toErrorResponse(
                        error.message,
                        'INTERNAL_ERROR'
                    ),
                    500
                );
            }

            return c.json(
                SendMoneyMapper.toErrorResponse(
                    'An unknown error occurred',
                    'UNKNOWN_ERROR'
                ),
                500
            );
        }
    }
);

/**
 * パスパラメータ版のエンドポイント（後方互換性のため残す）
 * POST /accounts/send/:sourceAccountId/:targetAccountId/:amount
 */
sendMoneyRouter.post(
    '/accounts/send/:sourceAccountId/:targetAccountId/:amount',
    zValidator('param', SendMoneyParamSchema),
    async (c): Promise<Response> => {
        // バリデーション済みのパスパラメータを取得（型安全）
        const webRequest = c.req.valid('param');

        try {
            const command = SendMoneyMapper.toCommand(webRequest);
            const sendMoneyUseCase = container.resolve<SendMoneyUseCase>(
                SendMoneyUseCaseToken
            );
            const success = await sendMoneyUseCase.sendMoney(command);

            if (success) {
                return c.json(SendMoneyMapper.toSuccessResponse(webRequest));
            } else {
                return c.json(
                    SendMoneyMapper.toErrorResponse(
                        'Money transfer failed - insufficient balance',
                        'INSUFFICIENT_BALANCE'
                    ),
                    400
                );
            }
        } catch (error) {
            if (error instanceof ThresholdExceededException) {
                return c.json(
                    SendMoneyMapper.toErrorResponse(
                        error.message,
                        'THRESHOLD_EXCEEDED',
                        {
                            threshold: error.threshold.toString(),
                            attempted: error.actual.toString(),
                        }
                    ),
                    400
                );
            }

            if (error instanceof Error) {
                return c.json(
                    SendMoneyMapper.toErrorResponse(error.message, 'INTERNAL_ERROR'),
                    500
                );
            }

            return c.json(
                SendMoneyMapper.toErrorResponse(
                    'An unknown error occurred',
                    'UNKNOWN_ERROR'
                ),
                500
            );
        }
    }
);

/**
 * 残高照会エンドポイント
 * GET /accounts/:accountId/balance
 */
sendMoneyRouter.get('/accounts/:accountId/balance', (c): Response => {
    return c.json({
        message: 'Balance inquiry endpoint - to be implemented',
    });
});