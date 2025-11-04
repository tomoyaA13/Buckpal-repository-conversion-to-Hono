import { Resend } from 'resend'
import type { EmailSenderPort } from '../../../application/port/out/EmailSenderPort'

/**
 * Resend を使ったメール送信アダプター
 *
 * 【責務】
 * EmailSenderPort インターフェースの実装
 * Resend API を使った実際のメール送信
 */
export class ResendEmailAdapter implements EmailSenderPort {
    private resend: Resend

    constructor(apiKey: string) {
        this.resend = new Resend(apiKey)
        console.log('📮 ResendEmailAdapter initialized')
    }

    async sendMoneyTransferNotification(
        recipientEmail: string,
        sourceAccountId: string,
        targetAccountId: string,
        amount: string
    ): Promise<void> {
        console.log(`📧 Sending email to: ${recipientEmail}`)

        // HTMLテンプレート文字列を使用（Reactコンポーネントの代わり）
        const htmlContent = this.createMoneyTransferredEmailHtml(
            sourceAccountId,
            targetAccountId,
            amount
        )

        const { data, error } = await this.resend.emails.send({
            from: 'Buckpal <onboarding@resend.dev>', // ← ドメイン検証後に変更してください
            // to: [recipientEmail],
            to:'alligatorfree12@gmail.com',
            subject: '送金が完了しました',
            html: htmlContent, // react プロパティではなく html プロパティを使用
        })

        if (error) {
            console.error('❌ Failed to send email:', error)
            throw new Error(`Email sending failed: ${error.message}`)
        }

        console.log('✅ Email sent successfully:', data)
    }

    /**
     * 送金完了メールのHTMLを生成
     */
    private createMoneyTransferredEmailHtml(
        sourceAccountId: string,
        targetAccountId: string,
        amount: string
    ): string {
        const formattedAmount = Number(amount).toLocaleString()

        return `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>送金完了通知</title>
</head>
<body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h1 style="color: #333; margin-bottom: 20px;">送金が完了しました</h1>
        
        <p style="color: #666; font-size: 16px; line-height: 1.6;">
            以下の送金が正常に処理されました：
        </p>
        
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 10px 0; color: #666; font-weight: bold;">送金元口座:</td>
                    <td style="padding: 10px 0; color: #333;">${sourceAccountId}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #666; font-weight: bold;">送金先口座:</td>
                    <td style="padding: 10px 0; color: #333;">${targetAccountId}</td>
                </tr>
                <tr>
                    <td style="padding: 10px 0; color: #666; font-weight: bold;">金額:</td>
                    <td style="padding: 10px 0; color: #333; font-size: 18px; font-weight: bold;">¥${formattedAmount}</td>
                </tr>
            </table>
        </div>
        
        <p style="margin-top: 30px; color: #666;">
            ご利用ありがとうございました。
        </p>
        
        <hr style="margin-top: 30px; border: none; border-top: 1px solid #eee;">
        
        <p style="font-size: 12px; color: #999; margin-top: 20px;">
            このメールは自動送信されています。<br>
            このメールに返信することはできません。
        </p>
    </div>
</body>
</html>
        `.trim()
    }
}