import { injectable } from 'tsyringe';
import { AccountLock as AccountLockInterface } from '../../../application/port/out/AccountLock';
import { AccountId } from '../../../application/domain/model/Activity';

/**
 * アカウントロックのNo-Op実装
 * 実際のロック処理は行わない（単一インスタンス環境用）
 * 
 * 本番環境では分散ロック（Redis等）を使った実装に置き換える
 */
@injectable()
export class NoOpAccountLock implements AccountLockInterface {
  lockAccount(accountId: AccountId): void {
    // 何もしない
  }

  releaseAccount(accountId: AccountId): void {
    // 何もしない
  }
}
