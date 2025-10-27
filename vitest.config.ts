import {defineWorkersConfig} from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
    test: {
        poolOptions: {
            workers: {
                wrangler: {
                    configPath: './wrangler.jsonc',
                },
                miniflare: {
                    // テスト専用のバインディング（オプション）
                    kvNamespaces: ['TEST_NAMESPACE'],
                    // ローカルSupabaseを使用する場合
                    bindings: {
                        SUPABASE_URL: 'http://127.0.0.1:54321',
                        SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
                    },
                },
            },
        },
    },
});