/**
 * 通知送信ユースケース（インターフェース）
 */
export interface SendNotificationUseCase {
    sendMoneyTransferNotification(
        recipientEmail: string,
        sourceAccountId: string,
        targetAccountId: string,
        amount: string
    ): Promise<void>
}

export const SendNotificationUseCaseToken = Symbol('SendNotificationUseCase')