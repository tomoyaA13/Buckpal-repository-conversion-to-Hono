import 'reflect-metadata';
import {Hono} from 'hono';
import {container} from "tsyringe";
import {sendMoneyRouter} from "./account/adapter/in/web/SendMoneyController";
import {initializeApplication} from "./config/app-initializer";
import type {DatabaseConfig} from "./config/types";
import {DatabaseConfigToken} from "./config/types";
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

// 初期化処理を app-initializer に委譲
app.use('*', async (c, next) => {
    initializeApplication(c.env);
    await next();
});

// APIルーターをマウント
app.route('/api', sendMoneyRouter);

// ヘルスチェックエンドポイント
app.get('/health', (c) => {
    const config = container.resolve<DatabaseConfig>(DatabaseConfigToken);
    return c.json({
        status: 'healthy',
        database: {
            url: config.url.replace(/\/\/.*@/, '//***@'), // 認証情報をマスク
            connected: true,
        },
    });
});

export default app;