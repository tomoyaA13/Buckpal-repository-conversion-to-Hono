/**
 * activitiesテーブルのレコード型（永続化済み、IDあり）
 */
export interface PersistedActivityRecord {
    id: number;
    timestamp: string;
    owner_account_id: number;
    source_account_id: number | null;  // ← nullable に変更
    target_account_id: number | null;  // ← nullable に変更
    amount: number;
    created_at: string;
}

/**
 * activitiesテーブルのレコード型（新規挿入用、IDなし）
 */
export interface ActivityRecord {
    timestamp: string;
    owner_account_id: number;
    source_account_id: number | null;  // ← nullable に変更
    target_account_id: number | null;  // ← nullable に変更
    amount: number;
}