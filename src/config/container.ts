import 'reflect-metadata';
import { createClient } from '@supabase/supabase-js';
import { container } from 'tsyringe';
import type {Database} from "../../supabase/database";
import { InMemoryAccountPersistenceAdapter } from '../adapter/out/persistence/InMemoryAccountPersistenceAdapter';
import { NoOpAccountLock } from '../adapter/out/persistence/NoOpAccountLock';
import { SupabaseAccountPersistenceAdapter } from '../adapter/out/persistence/SupabaseAccountPersistenceAdapter';
import { Money } from '../application/domain/model/Money';
import { MoneyTransferProperties, MoneyTransferPropertiesToken } from '../application/domain/service/MoneyTransferProperties';
import { SendMoneyDomainService } from '../application/domain/service/SendMoneyDomainService';
import { SendMoneyUseCaseToken } from '../application/port/in/SendMoneyUseCase';
import { AccountLockToken } from '../application/port/out/AccountLock';
import { LoadAccountPortToken } from '../application/port/out/LoadAccountPort';
import { UpdateAccountStatePortToken } from '../application/port/out/UpdateAccountStatePort';
import { SendMoneyApplicationService } from '../application/service/SendMoneyApplicationService';
import type { CloudflareBindings } from '../types/bindings';
import type { DatabaseConfig, TypedSupabaseClient } from './types';
import { DatabaseConfigToken, SupabaseClientToken } from './types';

// 初期化済みフラグ
let isInitialized = false;

/**
 * DIコンテナの初期化と依存関係の登録
 * 起動時に一度だけ実行される
 *
 * @param env Cloudflare Workers の環境変数
 */
export function setupContainer(env: CloudflareBindings): void {
    // 既に初期化済みなら何もしない
    if (isInitialized) {
        return;
    }

    console.log('🚀 Initializing DI container...');

    // ===== 設定オブジェクトの登録 =====

    // 送金上限の設定
    const transferThreshold = Money.of(1_000_000);
    const properties = new MoneyTransferProperties(transferThreshold);

    container.register(MoneyTransferPropertiesToken, {
        useValue: properties,
    });

    // ===== 出力アダプター（永続化層）の登録 =====
    const useSupabase = env.USE_SUPABASE === 'true';

    if (useSupabase) {
        console.log('📦 Using Supabase adapter');

        // データベース設定を登録
        const dbConfig: DatabaseConfig = {
            url: env.SUPABASE_URL,
            key: env.SUPABASE_PUBLISHABLE_KEY,
        };

        container.register(DatabaseConfigToken, {
            useValue: dbConfig,
        });

        // SupabaseClient をシングルトンとして登録
        const supabaseClient = createClient<Database>(dbConfig.url, dbConfig.key, {
            auth: {
                persistSession: false, // Cloudflare Workers では不要
            },
            // その他のグローバル設定をここで一元管理
            global: {
                headers: {
                    'x-application-name': 'buckpal',
                },
            },
        });

        container.register<TypedSupabaseClient>(SupabaseClientToken, {
            useValue: supabaseClient,
        });

        // Adapter をシングルトンとして登録
        container.registerSingleton(
            SupabaseAccountPersistenceAdapter,
            SupabaseAccountPersistenceAdapter
        );

        // 両方のポートで同じインスタンスを使用
        container.register(LoadAccountPortToken, {
            useToken: SupabaseAccountPersistenceAdapter,
        });

        container.register(UpdateAccountStatePortToken, {
            useToken: SupabaseAccountPersistenceAdapter,
        });
    } else {
        console.log('💾 Using InMemory adapter');

        container.registerSingleton(
            InMemoryAccountPersistenceAdapter,
            InMemoryAccountPersistenceAdapter
        );

        container.register(LoadAccountPortToken, {
            useToken: InMemoryAccountPersistenceAdapter,
        });

        container.register(UpdateAccountStatePortToken, {
            useToken: InMemoryAccountPersistenceAdapter,
        });
    }

    // ===== アカウントロックの登録 =====
    container.register(AccountLockToken, {
        useClass: NoOpAccountLock,
    });

    // ===== ドメインサービスの登録 =====
    container.registerSingleton(SendMoneyDomainService, SendMoneyDomainService);

    // ===== アプリケーションサービスの登録 =====
    container.register(SendMoneyUseCaseToken, {
        useClass: SendMoneyApplicationService,
    });

    isInitialized = true;
    console.log(`✅ DI container initialized (Supabase: ${useSupabase ? 'enabled' : 'disabled'})`);
}

/**
 * コンテナをリセット（主にテスト用）
 */
export function resetContainer(): void {
    container.clearInstances();
    isInitialized = false;
    console.log('🔄 DI container reset');
}

export { container };