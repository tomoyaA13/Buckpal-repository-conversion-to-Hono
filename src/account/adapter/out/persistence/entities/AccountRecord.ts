import type { PersistedActivityRecord } from './ActivityRecord';

/**
 * データベースから取得したアカウントレコード
 */
export interface PersistedAccountRecord {
  id: number;
}

/**
 * アカウントの完全な状態（アクティビティを含む）
 */
export interface AccountAggregateRecord {
  account: PersistedAccountRecord;
  activities: PersistedActivityRecord[];
  baselineBalance: number; // 計算されたベースライン残高
}
