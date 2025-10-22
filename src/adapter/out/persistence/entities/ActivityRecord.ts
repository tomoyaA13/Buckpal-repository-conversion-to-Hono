import type { Database } from '../../../../../supabase/database';

/**
 * データベースに挿入するアクティビティレコード
 * Supabaseの型定義から直接派生（単一の真実の源）
 * 
 * データベーススキーマを変更した場合：
 * 1. Supabaseの型を再生成: `supabase gen types typescript --local > supabase/database.ts`
 * 2. この型は自動的に更新される（手動変更不要）
 */
export type ActivityRecord = Database['public']['Tables']['activities']['Insert'];

/**
 * データベースから取得したアクティビティレコード
 * Supabaseの型定義から直接派生（単一の真実の源）
 * 
 * created_atフィールドはアプリケーションで使用しないため除外
 */
export type PersistedActivityRecord = Omit<
  Database['public']['Tables']['activities']['Row'],
  'created_at'
>;
