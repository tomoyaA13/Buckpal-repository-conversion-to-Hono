import {defineWorkersConfig} from "@cloudflare/vitest-pool-workers/config";
import {nodePolyfills} from "vite-plugin-node-polyfills";
import {config} from "dotenv";

// .dev.varsまたは.envファイルを読み込む
config({path: ".dev.vars"});

if (!process.env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not set in .dev.vars");
}

export default defineWorkersConfig({
    test: {
        poolOptions: {
            workers: {
                singleWorker: true,
                wrangler: {configPath: "./wrangler.jsonc"},
                miniflare: {
                    bindings: {
                        SUPABASE_URL: "http://127.0.0.1:54321",
                        SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
                        RESEND_API_KEY: "re_test_dummy_key_12345678"
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