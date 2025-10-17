import 'reflect-metadata';
import {Hono} from 'hono';
import {setupContainer} from './config/container';
import {sendMoneyRouter} from './adapter/in/web/SendMoneyController';
import type {CloudflareBindings} from './types/bindings';

// Honoアプリケーションに型を適用
const app = new Hono<{ Bindings: CloudflareBindings }>();

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

// 環境変数をDIコンテナに渡す
app.use('*', async (c, next) => {
    // DIコンテナを環境変数付きで初期化
    setupContainer(c.env);
    await next();
});

// APIルーターをマウント
app.route('/api', sendMoneyRouter);

// ヘルスチェックエンドポイント
app.get('/health', (c) => {
    return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        useSupabase: c.env.USE_SUPABASE === 'true',
    });
});

export default app;