/**
 * Cloudflare Workers の環境変数とバインディングの型定義
 */
export interface CloudflareBindings {
    // 環境変数
    USE_SUPABASE: string;
    SUPABASE_URL: string;
    SUPABASE_PUBLISHABLE_KEY: string;
    RESEND_API_KEY: string;
}