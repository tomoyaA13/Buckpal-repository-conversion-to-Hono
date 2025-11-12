/**
 * メール送信の窓口（ポート）
 *
 * 【責務】
 * メール送信機能の抽象化
 *
 * 【実装例】
 * - ResendEmailAdapter: Resend API を使った実装
 * - SendGridEmailAdapter: SendGrid を使った実装（将来の拡張）
 * - MockEmailAdapter: テスト用のモック実装
 */
export interface EmailSenderPort {
    /**
     * 送金通知メールを送信
     *
     * @param recipientEmail 受信者のメールアドレス
     * @param sourceAccountId 送金元口座ID
     * @param targetAccountId 送金先口座ID
     * @param amount 金額（文字列形式）
     */
    sendMoneyTransferNotification(
        recipientEmail: string,
        sourceAccountId: string,
        targetAccountId: string,
        amount: string
    ): Promise<void>
}

/**
 * DIコンテナ用のトークン
 */
export const EmailSenderPortToken = Symbol('EmailSenderPort')