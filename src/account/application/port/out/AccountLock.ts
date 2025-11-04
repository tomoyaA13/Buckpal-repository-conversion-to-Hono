import type { AccountId } from '../../domain/model/Activity';

/**
 * アカウントのロック/アンロックを行う出力ポート
 * 並行処理時の競合を防ぐために使用
 */
export interface AccountLock {
  /**
   * アカウントをロック
   * 
   * @param accountId ロックするアカウントのID
   */
  lockAccount(accountId: AccountId): void;

  /**
   * アカウントのロックを解放
   * 
   * @param accountId アンロックするアカウントのID
   */
  releaseAccount(accountId: AccountId): void;
}

/**
 * DI用のシンボル
 */
export const AccountLockToken = Symbol('AccountLock');
