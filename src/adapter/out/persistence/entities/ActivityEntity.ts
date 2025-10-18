/**
 * データベースのactivitiesテーブルを表現するエンティティ
 * Supabaseのテーブル構造と1対1で対応
 */
export interface ActivityEntity {
  id?: number;
  timestamp: string; // ISO 8601形式
  owner_account_id: number;
  source_account_id: number;
  target_account_id: number;
  amount: number;
}

/**
 * データベースから取得した際の型（idが必須）
 */
export interface PersistedActivityEntity extends Required<ActivityEntity> {
  id: number;
}
