import { Account } from '../../domain/model/Account';

/**
 * アカウント状態を更新するための出力ポート
 * 永続化アダプターが実装する
 */
export interface UpdateAccountStatePort {
  /**
   * アカウントのアクティビティを更新
   * 新しいアクティビティのみをDBに保存
   * 
   * @param account 更新するアカウント
   */
  updateActivities(account: Account): Promise<void>;
}

/**
 * DI用のシンボル
 */
export const UpdateAccountStatePort = Symbol('UpdateAccountStatePort');
