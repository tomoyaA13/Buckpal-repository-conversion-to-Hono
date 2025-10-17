// src/config/container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';
import { Money } from '../application/domain/model/Money';
import { SendMoneyDomainService } from '../application/domain/service/SendMoneyDomainService';
import { SendMoneyApplicationService } from '../application/service/SendMoneyApplicationService';
import { MoneyTransferProperties, MoneyTransferPropertiesToken } from '../application/domain/service/MoneyTransferProperties';
import { InMemoryAccountPersistenceAdapter } from '../adapter/out/persistence/InMemoryAccountPersistenceAdapter';
import { SupabaseAccountPersistenceAdapter } from '../adapter/out/persistence/SupabaseAccountPersistenceAdapter';
import { NoOpAccountLock } from '../adapter/out/persistence/NoOpAccountLock';
import { LoadAccountPortToken } from '../application/port/out/LoadAccountPort';
import { UpdateAccountStatePortToken } from '../application/port/out/UpdateAccountStatePort';
import { AccountLockToken } from '../application/port/out/AccountLock';
import { SendMoneyUseCaseToken } from '../application/port/in/SendMoneyUseCase';
import type { CloudflareBindings } from '../types/bindings';

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
    const transferThreshold = Money.of(1_000_000); // 100万円が上限
    const properties = new MoneyTransferProperties(transferThreshold);

    container.register(MoneyTransferPropertiesToken, {
        useValue: properties,
    });

    // ===== 出力アダプター（永続化層）の登録 =====
    const useSupabase = env.USE_SUPABASE === 'true';

    if (useSupabase) {
        console.log('📦 Using Supabase adapter');

        // Supabase Adapter を使用（シングルトン）
        const supabaseAdapter = new SupabaseAccountPersistenceAdapter(
            env.SUPABASE_URL,
            env.SUPABASE_PUBLISHABLE_KEY
        );

        // 同じインスタンスを両方のポートで使用
        container.register(LoadAccountPortToken, {
            useValue: supabaseAdapter,
        });

        container.register(UpdateAccountStatePortToken, {
            useValue: supabaseAdapter,
        });
    } else {
        console.log('💾 Using InMemory adapter');

        // InMemory Adapter を使用（シングルトン）
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
    console.log(`✅ DI container initialized (Supabase: ${useSupabase})`);
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