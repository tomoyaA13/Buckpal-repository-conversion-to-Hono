import 'reflect-metadata';
import {Hono} from 'hono';
import {setupContainer} from './config/container';
import {sendMoneyRouter} from './adapter/in/web/SendMoneyController';
import type {CloudflareBindings} from './types/bindings';
import {container} from "tsyringe";
import {DatabaseConfig, DatabaseConfigToken} from "./config/types";

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

// 起動時に一度だけDIコンテナを初期化
// Cloudflare Workers では最初のリクエスト時に実行される
app.use('*', async (c, next) => {
    // 環境変数を使ってコンテナを初期化（初回のみ）
    setupContainer(c.env);
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