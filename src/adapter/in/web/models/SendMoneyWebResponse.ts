/**
 * Web層専用のレスポンスモデル
 */
export interface SendMoneyWebResponse {
  success: boolean;
  message: string;
  data?: {
    sourceAccountId: string;
    targetAccountId: string;
    amount: string;
    timestamp: string;
  };
  error?: {
    code: string;
    details?: Record<string, any>;
  };
}
