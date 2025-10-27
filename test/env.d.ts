import type {Env} from '@/types/bindings';

declare module 'cloudflare:test' {
    // ProvidedEnv controls the type of `import("cloudflare:test").env`
    interface ProvidedEnv extends Env {
        // テスト専用のバインディングがあればここに追加
        TEST_NAMESPACE?: KVNamespace;
    }
}