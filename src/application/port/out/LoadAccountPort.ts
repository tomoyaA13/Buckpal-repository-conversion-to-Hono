import { Account } from '../../domain/model/Account';
import { AccountId } from '../../domain/model/Activity';

/**
 * アカウントをロードするための出力ポート
 * 永続化アダプターが実装する
 */
export interface LoadAccountPort {
  /**
   * アカウントIDと基準日を指定してアカウントをロード
   * 
   * @param accountId ロードするアカウントのID
   * @param baselineDate 基準日（この日付以降のアクティビティをロード）
   * @returns アカウントエンティティ
   */
  loadAccount(accountId: AccountId, baselineDate: Date): Promise<Account>;
}

/**
 * DI用のシンボル
 */
export const LoadAccountPort = Symbol('LoadAccountPort');
