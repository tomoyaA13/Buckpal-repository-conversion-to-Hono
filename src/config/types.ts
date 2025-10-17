/**
 * データベース接続設定
 */
export interface DatabaseConfig {
    url: string;
    key: string;
}

/**
 * DI用のトークン
 */
export const DatabaseConfigToken = Symbol('DatabaseConfig');