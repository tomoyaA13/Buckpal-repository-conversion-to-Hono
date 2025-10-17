import { PersistedActivityEntity } from './ActivityEntity';

/**
 * データベースのaccountsテーブルを表現するエンティティ
 */
export interface AccountEntity {
  id: number;
}

/**
 * アカウントの完全な状態（アクティビティを含む）
 */
export interface AccountAggregateEntity {
  account: AccountEntity;
  activities: PersistedActivityEntity[];
  baselineBalance: number; // 計算されたベースライン残高
}
