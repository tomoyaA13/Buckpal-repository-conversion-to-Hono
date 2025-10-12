import 'reflect-metadata';
import { Hono } from 'hono';
import { setupContainer } from './config/container';
import { sendMoneyRouter } from './adapter/in/web/SendMoneyController';

// DIコンテナを初期化
setupContainer();

// Honoアプリケーションを作成
const app = new Hono();

// ルートエンドポイント
app.get('/', (c) => {
  return c.json({
    message: 'BuckPal API - Hexagonal Architecture with Hono + TypeScript',
    version: '1.0.0',
    endpoints: {
      sendMoney: 'POST /api/accounts/send/:sourceAccountId/:targetAccountId/:amount',
      getBalance: 'GET /api/accounts/:accountId/balance (coming soon)',
    },
  });
});

// APIルーターをマウント
app.route('/api', sendMoneyRouter);

// ヘルスチェックエンドポイント
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default app;
