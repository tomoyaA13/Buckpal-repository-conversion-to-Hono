import { Hono } from 'hono';
import { container } from 'tsyringe';
import { SendMoneyUseCase } from '../../../application/port/in/SendMoneyUseCase';
import { SendMoneyCommand } from '../../../application/port/in/SendMoneyCommand';
import { AccountId } from '../../../application/domain/model/Activity';
import { Money } from '../../../application/domain/model/Money';
import { ThresholdExceededException } from '../../../application/domain/service/ThresholdExceededException';

/**
 * 送金コントローラー
 * Honoを使ったWebアダプター
 */
export const sendMoneyRouter = new Hono();

/**
 * 送金エンドポイント
 * POST /accounts/send/:sourceAccountId/:targetAccountId/:amount
 */
sendMoneyRouter.post(
  '/accounts/send/:sourceAccountId/:targetAccountId/:amount',
  async (c) => {
    try {
      // パスパラメータを取得
      const sourceAccountId = new AccountId(
        BigInt(c.req.param('sourceAccountId'))
      );
      const targetAccountId = new AccountId(
        BigInt(c.req.param('targetAccountId'))
      );
      const amount = Money.of(BigInt(c.req.param('amount')));

      // コマンドを作成（バリデーション込み）
      const command = new SendMoneyCommand(
        sourceAccountId,
        targetAccountId,
        amount
      );

      // DIコンテナからユースケースを取得
      const sendMoneyUseCase = container.resolve<SendMoneyUseCase>(
        SendMoneyUseCase as symbol
      );

      // 送金を実行
      const success = await sendMoneyUseCase.sendMoney(command);

      if (success) {
        return c.json({
          success: true,
          message: 'Money transfer completed successfully',
        });
      } else {
        return c.json(
          {
            success: false,
            message: 'Money transfer failed - insufficient balance',
          },
          400
        );
      }
    } catch (error) {
      // エラーハンドリング
      if (error instanceof ThresholdExceededException) {
        return c.json(
          {
            success: false,
            message: error.message,
            threshold: error.threshold.toString(),
            attempted: error.actual.toString(),
          },
          400
        );
      }

      if (error instanceof Error) {
        return c.json(
          {
            success: false,
            message: error.message,
          },
          500
        );
      }

      return c.json(
        {
          success: false,
          message: 'An unknown error occurred',
        },
        500
      );
    }
  }
);

/**
 * 残高照会エンドポイント（後で実装）
 * GET /accounts/:accountId/balance
 */
sendMoneyRouter.get('/accounts/:accountId/balance', async (c) => {
  return c.json({
    message: 'Balance inquiry endpoint - to be implemented',
  });
});
