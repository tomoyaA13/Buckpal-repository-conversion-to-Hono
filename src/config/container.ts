/**
 * DIコンテナ設定ファイル
 *
 * 【DIコンテナとは？】
 * Dependency Injection（依存性注入）を自動化する仕組み。
 * 各クラスが必要とする依存オブジェクトを、コンテナが自動的に生成・注入してくれる。
 *
 * 【なぜDIコンテナを使うのか？】
 * 1. 依存性の逆転原則（DIP）を実現できる
 *    - 高レベル層（Application層）が低レベル層（Adapter層）に依存しない
 *    - インターフェース（Port）に依存し、実装は外部から注入される
 *
 * 2. 疎結合を実現できる
 *    - SendMoneyApplicationService は具体的な永続化方法を知らない
 *    - InMemory でも Supabase でも同じコードで動作する
 *
 * 3. テストが容易になる
 *    - 本番環境：Supabase アダプターを注入
 *    - テスト環境：InMemory アダプターやモックを注入
 *
 * 【tsyringe の基本用語】
 * - Token: 依存オブジェクトを識別するためのキー（通常はSymbol）
 * - register: コンテナに「このTokenならこのクラス/値を使う」というルールを登録
 * - resolve: Tokenを指定して、対応するインスタンスを取得
 * - inject: クラスのコンストラクタで、どの依存が必要かを宣言
 */

import 'reflect-metadata'; // tsyringe が必要とするメタデータ機能を有効化
import {createClient} from '@supabase/supabase-js';
import {container} from 'tsyringe';
import type {Database} from "../../supabase/database";
import {InMemoryAccountPersistenceAdapter} from '../account/adapter/out/persistence/InMemoryAccountPersistenceAdapter';
import {NoOpAccountLock} from '../account/adapter/out/persistence/NoOpAccountLock';
import {SupabaseAccountPersistenceAdapter} from '../account/adapter/out/persistence/SupabaseAccountPersistenceAdapter';
import {Money} from '../account/application/domain/model/Money';
import {
    MoneyTransferProperties,
    MoneyTransferPropertiesToken
} from '../account/application/domain/service/MoneyTransferProperties';
import {SendMoneyDomainService} from '../account/application/domain/service/SendMoneyDomainService';
import {SendMoneyUseCaseToken} from '../account/application/port/in/SendMoneyUseCase';
import {AccountLockToken} from '../account/application/port/out/AccountLock';
import {LoadAccountPortToken} from '../account/application/port/out/LoadAccountPort';
import {UpdateAccountStatePortToken} from '../account/application/port/out/UpdateAccountStatePort';
import {SendMoneyApplicationService} from '../account/application/service/SendMoneyApplicationService';
import {EventBus} from "../common/event/EventBus";
import {ResendEmailAdapter} from "../notification/adapter/out/email/ResendEmailAdapter";
import {EmailSenderPortToken} from "../notification/application/port/out/EmailSenderPort";
import {NotificationService} from "../notification/application/service/NotificationService";
import type {CloudflareBindings} from '../types/bindings';
import type {DatabaseConfig, TypedSupabaseClient} from './types';
import {DatabaseConfigToken, EventBusToken, SupabaseClientToken} from './types';

// 初期化済みフラグ（複数回初期化を防ぐ）
let isInitialized = false;

/**
 * DIコンテナの初期化と依存関係の登録
 *
 * このファイルの最も重要な関数。アプリケーション起動時に一度だけ実行される。
 *
 * 【処理の流れ】
 * 1. 設定オブジェクト（MoneyTransferProperties）の登録
 * 2. 永続化アダプター（InMemory または Supabase）の登録
 * 3. アカウントロックの登録
 * 4. ドメインサービスの登録
 * 5. アプリケーションサービス（UseCase実装）の登録
 *
 * @param env Cloudflare Workers の環境変数（SUPABASE_URL など）
 */
export function setupContainer(env: CloudflareBindings): void {
    // 既に初期化済みなら何もしない（冪等性の確保）
    if (isInitialized) {
        return;
    }

    console.log('🚀 Initializing DI container...');

    // ========================================
    // 1. 設定オブジェクトの登録
    // ========================================

    /**
     * MoneyTransferProperties: 送金の業務ルール（閾値など）を保持
     *
     * 【useValue とは？】
     * 既存のオブジェクトインスタンスをそのまま登録する方法。
     * container.resolve(MoneyTransferPropertiesToken) を呼ぶと、
     * この properties インスタンスが返される。
     */
    const transferThreshold = Money.of(1_000_000); // 送金上限: 100万円
    const properties = new MoneyTransferProperties(transferThreshold);

    container.register(MoneyTransferPropertiesToken, {
        useValue: properties, // この具体的なインスタンスを使う
    });

    // ========================================
    // 2. 出力アダプター（永続化層）の登録
    // ========================================

    /**
     * 【ヘキサゴナルアーキテクチャのポイント】
     * Application層は「LoadAccountPort」「UpdateAccountStatePort」という
     * インターフェース（Port）にしか依存しない。
     *
     * 実際の実装（Adapter）は環境変数で切り替える：
     * - USE_SUPABASE=true  → SupabaseAccountPersistenceAdapter
     * - USE_SUPABASE=false → InMemoryAccountPersistenceAdapter
     *
     * Application層のコードは一切変更不要！これが「依存性の逆転」の威力。
     */
    const useSupabase = env.USE_SUPABASE === 'true';

    if (useSupabase) {
        console.log('📦 Using Supabase adapter');

        // ----------------------------------------
        // Supabase アダプターの登録
        // ----------------------------------------

        /**
         * DatabaseConfig: Supabase接続情報を保持
         * これも useValue で登録（環境変数から作成した設定オブジェクト）
         */
        const dbConfig: DatabaseConfig = {
            url: env.SUPABASE_URL,
            key: env.SUPABASE_PUBLISHABLE_KEY,
        };

        container.register(DatabaseConfigToken, {
            useValue: dbConfig,
        });

        /**
         * TypedSupabaseClient: Supabaseクライアントの作成
         *
         * 【シングルトンとして登録する理由】
         * Supabaseクライアントは接続プールを持つため、
         * アプリケーション全体で1つのインスタンスを共有すべき。
         * 毎回新規作成すると、パフォーマンスが悪化する。
         */
        const supabaseClient = createClient<Database>(dbConfig.url, dbConfig.key, {
            auth: {
                persistSession: false, // Cloudflare Workers ではセッション永続化不要
            },
            // グローバル設定（全てのリクエストに適用されるヘッダーなど）
            global: {
                headers: {
                    'x-application-name': 'buckpal',
                },
            },
        });

        container.register<TypedSupabaseClient>(SupabaseClientToken, {
            useValue: supabaseClient, // 作成済みインスタンスを登録
        });

        /**
         * SupabaseAccountPersistenceAdapter の登録
         *
         * 【registerSingleton とは？】
         * クラスをシングルトン（アプリケーション全体で1つのインスタンス）として登録。
         * 初回の resolve 時にインスタンスが作成され、以降は同じインスタンスが返される。
         *
         * コンストラクタで @inject デコレータを使っていれば、
         * 必要な依存（SupabaseClient など）が自動的に注入される。
         */
        container.registerSingleton(
            SupabaseAccountPersistenceAdapter,
            SupabaseAccountPersistenceAdapter
        );

        /**
         * Port（インターフェース）と Adapter（実装）の紐付け
         *
         * 【useToken とは？】
         * 別のTokenに登録されているインスタンスを再利用する方法。
         *
         * ここでは：
         * - LoadAccountPortToken で resolve すると → SupabaseAccountPersistenceAdapter
         * - UpdateAccountStatePortToken で resolve すると → SupabaseAccountPersistenceAdapter
         *
         * つまり、1つのAdapterが複数のPortを実装している場合、
         * 同じインスタンスを使い回すことができる。
         *
         * 【なぜこうするのか？】
         * SendMoneyApplicationService のコンストラクタは：
         * ```typescript
         * constructor(
         *   @inject(LoadAccountPortToken) private loadAccountPort: LoadAccountPort,
         *   @inject(UpdateAccountStatePortToken) private updateAccountStatePort: UpdateAccountStatePort
         * ) {}
         * ```
         * このように Port（インターフェース）に依存している。
         * 実際に注入されるのは SupabaseAccountPersistenceAdapter だが、
         * Application層はそれを知らない。これが「依存性の逆転」！
         */
        container.register(LoadAccountPortToken, {
            useToken: SupabaseAccountPersistenceAdapter,
        });

        container.register(UpdateAccountStatePortToken, {
            useToken: SupabaseAccountPersistenceAdapter,
        });
    } else {
        console.log('💾 Using InMemory adapter');

        // ----------------------------------------
        // InMemory アダプターの登録
        // ----------------------------------------

        /**
         * 開発・テスト用のアダプター
         * データベース不要で動作し、メモリ上にデータを保持する。
         *
         * 登録方法は Supabase の場合と同じ。
         * Application層から見れば、どちらのAdapterが使われているか分からない。
         */
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

    // ========================================
    // 3. アカウントロック機構の登録
    // ========================================

    /**
     * AccountLock: 並行処理時のデータ競合を防ぐための機構
     *
     * 【useClass とは？】
     * クラスを指定して登録する方法。resolve時に毎回新しいインスタンスが作成される。
     * （registerSingleton と違い、呼ぶたびに新規作成）
     *
     * ここでは NoOpAccountLock（何もしない実装）を使用。
     * 本番環境では Redis などを使った実装に切り替えることができる。
     */
    container.register(AccountLockToken, {
        useClass: NoOpAccountLock,
    });

    // ========================================
    // 4. ドメインサービスの登録
    // ========================================

    /**
     * SendMoneyDomainService: ドメインロジックを実行するサービス
     *
     * シングルトンとして登録。ドメインサービスは通常ステートレスなので、
     * 1つのインスタンスを共有して問題ない。
     */
    container.registerSingleton(SendMoneyDomainService, SendMoneyDomainService);

    // ========================================
    // 5. アプリケーションサービスの登録
    // ========================================

    /**
     * SendMoneyApplicationService: ユースケースの実装
     *
     * 【重要】
     * このクラスは LoadAccountPort, UpdateAccountStatePort などに依存しているが、
     * 具体的な実装（Supabase か InMemory か）は知らない。
     *
     * container.resolve(SendMoneyUseCaseToken) を呼ぶと、
     * 必要な依存が全て自動的に注入された SendMoneyApplicationService が返される。
     *
     * これにより、Webアダプター（Hono のルートハンドラ）は：
     * ```typescript
     * const useCase = container.resolve(SendMoneyUseCaseToken);
     * await useCase.sendMoney(command);
     * ```
     * このようにシンプルに使える。依存関係の解決はコンテナが全て処理してくれる。
     */
    container.register(SendMoneyUseCaseToken, {
        useClass: SendMoneyApplicationService,
    });

    // EventBusの登録
    const eventBus = new EventBus()
    container.register(EventBusToken, {
        useValue: eventBus,
    })

    // NotificationServiceの登録
    container.register(EmailSenderPortToken, {
        useFactory: () => new ResendEmailAdapter(env.RESEND_API_KEY),
    })
    container.registerSingleton(NotificationService, NotificationService)

    // ========================================
    // ⚠️ イベント購読設定は削除
    // ========================================
    // これは app-initializer.ts で行う


    isInitialized = true;
    console.log(`✅ DI container initialized (Supabase: ${useSupabase ? 'enabled' : 'disabled'})`);
}

/**
 * コンテナをリセット（主にテスト用）
 *
 * テスト実行時に各テストケースで独立した環境を作るため、
 * beforeEach などでコンテナをリセットすることがある。
 */
export function resetContainer(): void {
    container.clearInstances();
    isInitialized = false;
    console.log('🔄 DI container reset');
}

export {container};