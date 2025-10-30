import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineWorkersConfig({
    test: {
        poolOptions: {
            workers: {
                wrangler: { configPath: "./wrangler.jsonc" },
                miniflare: {
                    bindings: {
                        SUPABASE_URL: "http://127.0.0.1:54321",
                        SUPABASE_PUBLISHABLE_KEY:'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
                    },
                },
            },
        },
    },
    plugins: [
        nodePolyfills({
            // punycode、その他のNode.jsモジュールのポリフィルを有効化
            include: ['punycode', 'util', 'buffer', 'stream'],
        }),
    ],
    resolve: {
        conditions: ["workerd", "worker", "browser"],
        mainFields: ["browser", "module", "main"],
        alias: {
            // node:プレフィックスの解決を支援
            'node:punycode': 'punycode',
            'node:util': 'util',
            'node:buffer': 'buffer',
            'node:stream': 'stream',
        },
    },
    optimizeDeps: {
        include: [
            "@supabase/supabase-js",
            "@supabase/postgrest-js",
            "@supabase/realtime-js",
            "@supabase/storage-js",
            "@supabase/functions-js",
            "@supabase/auth-js",
            "punycode",
            "whatwg-url",
        ],
    },
    ssr: {
        noExternal: [
            "@supabase/supabase-js",
            "@supabase/postgrest-js",
            "@supabase/realtime-js",
            "@supabase/storage-js",
            "@supabase/functions-js",
            "@supabase/auth-js",
        ],
    },
});