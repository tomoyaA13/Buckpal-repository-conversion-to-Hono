import 'reflect-metadata';
import { container } from 'tsyringe';
import { Money } from '../application/domain/model/Money';
import { SendMoneyDomainService } from '../application/domain/service/SendMoneyDomainService';
import { SendMoneyApplicationService } from '../application/service/SendMoneyApplicationService';
import { MoneyTransferProperties, MoneyTransferPropertiesToken } from '../application/domain/service/MoneyTransferProperties';
import { InMemoryAccountPersistenceAdapter } from '../adapter/out/persistence/InMemoryAccountPersistenceAdapter';
import { NoOpAccountLock } from '../adapter/out/persistence/NoOpAccountLock';
import { LoadAccountPortToken } from '../application/port/out/LoadAccountPort';
import { UpdateAccountStatePortToken } from '../application/port/out/UpdateAccountStatePort';
import { AccountLockToken } from '../application/port/out/AccountLock';
import { SendMoneyUseCaseToken } from '../application/port/in/SendMoneyUseCase';

/**
 * DIコンテナの初期化と依存関係の登録
 * アプリケーション起動時に一度だけ実行される
 */
export function setupContainer(): void {
  // ===== 設定オブジェクトの登録 =====
  const transferThreshold = Money.of(1_000_000); // 100万円が上限
  const properties = new MoneyTransferProperties(transferThreshold);

  // 「作成済みのインスタンスを使ってね」と登録
  // useValue → 既存のインスタンスを使用（vs useClass → コンテナがインスタンスを生成）
  container.register(MoneyTransferPropertiesToken, {
    useValue: properties,
  });

  // ===== 出力アダプター（永続化層）の登録 =====
  // 「このクラスが必要な時は自動で作ってね（アプリ全体で1つだけ）」と登録
  // 第1引数: 「このトークンが要求されたとき」、第2引数: 「このクラスのインスタンスを返す」
  container.registerSingleton(
    InMemoryAccountPersistenceAdapter,
    InMemoryAccountPersistenceAdapter
  );

  // 「このインターフェース（LoadAccountPort）にはこの実装（InMemoryAccountPersistenceAdapter）を使ってね」と登録
  // 第1引数: 「このトークン（LoadAccountPortToken）が要求されたとき」、useToken: 「このトークン（InMemoryAccountPersistenceAdapter）を解決して返す」
  // LoadAccountPortとUpdateAccountStatePortは同じインスタンスを使用
  container.register(LoadAccountPortToken, {
    useToken: InMemoryAccountPersistenceAdapter,
  });

  // LoadAccountPortとUpdateAccountStatePortは同じインスタンスを使用
  // 「このインターフェース（UpdateAccountStatePort）にはこの実装（InMemoryAccountPersistenceAdapter）を使ってね」と登録
  container.register(UpdateAccountStatePortToken, {
    useToken: InMemoryAccountPersistenceAdapter,
  });

  // 「毎回新しいインスタンスを作ってね」と登録
  // 第1引数: 「このトークン（AccountLockToken）が要求されたとき」、useClass: 「このクラス（NoOpAccountLock）の新しいインスタンスを返す」
  container.register(AccountLockToken, {
    useClass: NoOpAccountLock,
  });

  // ===== ドメインサービス（純粋なビジネスロジック）の登録 =====
  // 「このクラスが必要な時は自動で作ってね（アプリ全体で1つだけ）」と登録
  container.registerSingleton(SendMoneyDomainService, SendMoneyDomainService);

  // ===== アプリケーションサービス（ユースケースの調整役）の登録 =====
  // 「このインターフェース（SendMoneyUseCase）にはこの実装（SendMoneyApplicationService）を使ってね」と登録
  // 第1引数: 「このトークン（SendMoneyUseCaseToken）が要求されたとき」、useClass: 「このクラス（SendMoneyApplicationService）の新しいインスタンスを返す」
  container.register(SendMoneyUseCaseToken, {
    useClass: SendMoneyApplicationService,
  });

  console.log('✅ DI container initialized successfully');
}

/**
 * コンテナをリセット（主にテスト用）
 */
export function resetContainer(): void {
  container.clearInstances();
  setupContainer();
}

export { container };
