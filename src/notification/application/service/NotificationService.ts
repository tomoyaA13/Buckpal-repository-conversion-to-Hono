import { inject, injectable } from 'tsyringe'
import type { MoneyTransferredEvent } from '../../../common/event/events/MoneyTransferredEvent'
import type { SendNotificationUseCase } from '../port/in/SendNotificationUseCase'
import { EmailSenderPort, EmailSenderPortToken } from '../port/out/EmailSenderPort'

/**
 * 通知サービス
 *
 * 【役割】
 * - MoneyTransferredEvent を購読
 * - イベントを受け取ったらメール通知を送る
 * - エラーハンドリング
 */
@injectable()
export class NotificationService implements SendNotificationUseCase {
    constructor(
        @inject(EmailSenderPortToken)
        private readonly emailSender: EmailSenderPort
    ) {}

    /**
     * MoneyTransferredEvent のハンドラー
     *
     * EventBus から呼び出される
     */
    async handleMoneyTransferred(event: MoneyTransferredEvent): Promise<void> {
        try {
            console.log(`📧 Handling MoneyTransferred event: ${event.eventId}`)

            // TODO: 実際の受取人メールアドレスを取得
            // 現時点では固定値を使用
            await this.sendMoneyTransferNotification(
                'recipient@example.com',
                event.sourceAccountId.getValue().toString(),
                event.targetAccountId.getValue().toString(),
                event.amount.getAmount().toString()
            )

            console.log(`✅ Notification sent for event: ${event.eventId}`)
        } catch (error) {
            console.error(`❌ Failed to send notification for event ${event.eventId}:`, error)
            // エラーをログに記録するが、送金処理には影響させない
            // 将来的にはリトライキューに入れるなどの処理を追加
        }
    }

    /**
     * 送金通知メールを送信
     */
    async sendMoneyTransferNotification(
        recipientEmail: string,
        sourceAccountId: string,
        targetAccountId: string,
        amount: string
    ): Promise<void> {
        await this.emailSender.sendMoneyTransferNotification(
            recipientEmail,
            sourceAccountId,
            targetAccountId,
            amount
        )
    }
}