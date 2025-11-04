import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '../../supabase/database';

/**
 * データベース接続設定
 */
export interface DatabaseConfig {
    url: string;
    key: string;
}

/**
 * 型付きSupabaseClient
 */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * DI用のトークン
 */
export const DatabaseConfigToken = Symbol('DatabaseConfig');
export const SupabaseClientToken = Symbol('SupabaseClient');

export const EventBusToken = Symbol('EventBus');