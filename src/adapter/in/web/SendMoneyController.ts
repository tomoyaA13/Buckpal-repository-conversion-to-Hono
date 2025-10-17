import { Hono } from 'hono';
import { container } from 'tsyringe';
import { SendMoneyUseCase, SendMoneyUseCaseToken } from '../../../application/port/in/SendMoneyUseCase';
import { SendMoneyWebRequestSchema } from './models/SendMoneyWebRequest';
import { SendMoneyMapper } from './mappers/SendMoneyMapper';
import { ThresholdExceededException } from '../../../application/domain/service/ThresholdExceededException';

/**
 * 送金コントローラー（双方向モデル変換版）
 * 
 * Web層の責務：
 * 1. HTTPリクエストを受け取る
 * 2. Web層のモデルでバリデーション
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
sendMoneyRouter.post('/accounts/send', async (c) => {
  try {
    // 1. リクエストボディを取得
    const body = await c.req.json();

    // 2. Web層でバリデーション
    const validationResult = SendMoneyWebRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return c.json(
        SendMoneyMapper.toErrorResponse(
          'Invalid request data',
          'VALIDATION_ERROR',
          { errors: validationResult.error.errors }
        ),
        400
      );
    }

    const webRequest = validationResult.data;

    // 3. Web層のモデルをドメイン層のコマンドに変換
    const command = SendMoneyMapper.toCommand(webRequest);

    // 4. DIコンテナからユースケースを取得して実行
    const sendMoneyUseCase = container.resolve<SendMoneyUseCase>(
      SendMoneyUseCaseToken
    );
    const success = await sendMoneyUseCase.sendMoney(command);

    // 5. 結果をWeb層のレスポンスに変換
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
});

/**
 * パスパラメータ版のエンドポイント（後方互換性のため残す）
 * POST /accounts/send/:sourceAccountId/:targetAccountId/:amount
 */
sendMoneyRouter.post(
  '/accounts/send/:sourceAccountId/:targetAccountId/:amount',
  async (c) => {
    // パスパラメータをWebリクエストモデルに変換
    const webRequest = {
      sourceAccountId: c.req.param('sourceAccountId'),
      targetAccountId: c.req.param('targetAccountId'),
      amount: c.req.param('amount'),
    };

    // 以降は同じ処理を再利用
    const validationResult = SendMoneyWebRequestSchema.safeParse(webRequest);
    if (!validationResult.success) {
      return c.json(
        SendMoneyMapper.toErrorResponse(
          'Invalid request data',
          'VALIDATION_ERROR',
          { errors: validationResult.error.errors }
        ),
        400
      );
    }

    try {
      const command = SendMoneyMapper.toCommand(validationResult.data);
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
sendMoneyRouter.get('/accounts/:accountId/balance', async (c) => {
  return c.json({
    message: 'Balance inquiry endpoint - to be implemented',
  });
});
