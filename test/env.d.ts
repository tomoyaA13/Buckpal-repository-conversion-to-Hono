/**
 * https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/
 * Cloudflare Workers テスト環境の型定義
 *
 * ProvidedEnv は cloudflare:test の env オブジェクトの型を定義します。
 * 本番環境の Env 型を拡張し、テスト専用のバインディングを追加します。
 */
declare module "cloudflare:test" {
    // wrangler types で生成された Env 型を拡張
    interface ProvidedEnv extends Env {
        // ===== テスト専用のバインディング =====
        // vitest.config.ts の miniflare.bindings で設定した環境変数

        // Supabase 接続情報（テスト用）
        SUPABASE_URL: string;
        SUPABASE_PUBLISHABLE_KEY: string;
        SUPABASE_SERVICE_ROLE_KEY: string;

        // 必要に応じて他のテスト用バインディングを追加
        // 例: TEST_KV: KVNamespace;
    }
}