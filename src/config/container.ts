import 'reflect-metadata';
import { container } from 'tsyringe';
import { Money } from '../application/domain/model/Money';
import { SendMoneyService } from '../application/domain/service/SendMoneyService';
import { MoneyTransferProperties } from '../application/domain/service/MoneyTransferProperties';
import { InMemoryAccountPersistenceAdapter } from '../adapter/out/persistence/InMemoryAccountPersistenceAdapter';
import { NoOpAccountLock } from '../adapter/out/persistence/NoOpAccountLock';
import { LoadAccountPort } from '../application/port/out/LoadAccountPort';
import { UpdateAccountStatePort } from '../application/port/out/UpdateAccountStatePort';
import { AccountLock } from '../application/port/out/AccountLock';
import { SendMoneyUseCase } from '../application/port/in/SendMoneyUseCase';

/**
 * DIコンテナの初期化と依存関係の登録
 * アプリケーション起動時に一度だけ実行される
 */
export function setupContainer(): void {
  // ===== 設定オブジェクトの登録 =====
  const transferThreshold = Money.of(1_000_000); // 100万円が上限
  const properties = new MoneyTransferProperties(transferThreshold);

  container.register(MoneyTransferProperties as symbol, {
    useValue: properties,
  });

  // ===== 出力アダプター（永続化層）の登録 =====
  // シングルトンとして登録（同じインスタンスを共有）
  container.registerSingleton(
    InMemoryAccountPersistenceAdapter,
    InMemoryAccountPersistenceAdapter
  );

  // LoadAccountPortとUpdateAccountStatePortは同じインスタンスを使用
  container.register(LoadAccountPort as symbol, {
    useToken: InMemoryAccountPersistenceAdapter,
  });

  container.register(UpdateAccountStatePort as symbol, {
    useToken: InMemoryAccountPersistenceAdapter,
  });

  // アカウントロックの登録
  container.register(AccountLock as symbol, {
    useClass: NoOpAccountLock,
  });

  // ===== ドメインサービス（ユースケース）の登録 =====
  container.register(SendMoneyUseCase as symbol, {
    useClass: SendMoneyService,
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
