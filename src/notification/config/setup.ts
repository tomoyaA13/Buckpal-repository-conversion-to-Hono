import type { DependencyContainer } from 'tsyringe'
import type { EventBus } from '../../common/event/EventBus'
import type { MoneyTransferredEvent } from '../../common/event/events/MoneyTransferredEvent'
import { NotificationService } from '../application/service/NotificationService'

/**
 * 通知コンテキストの初期化
 *
 * 【責務】
 * - このコンテキストが購読するイベントの設定
 * - このコンテキスト固有の初期化処理
 *
 * 【メリット】
 * - 通知コンテキスト関連の設定が1箇所にまとまる
 * - container.ts が肥大化しない
 * - 独立してテストできる
 */
export function setupNotificationContext(
    eventBus: EventBus,
    container: DependencyContainer
): void {
    console.log('🔔 Setting up notification context...')

    // NotificationService を解決
    const notificationService = container.resolve(NotificationService)

    // イベント購読設定
    eventBus.subscribe<MoneyTransferredEvent>(
        'MoneyTransferred',
        async (event) => {
            // ジェネリクスの型安全性の恩恵を直接受けられる
            console.log(`📤 送金イベント検出`)
            console.log(`  送金元: ${String(event.sourceAccountId.getValue())}`)
            console.log(`  送金先: ${String(event.targetAccountId.getValue())}`)
            console.log(`  金額: ${String(event.amount.getAmount())}`)
            await notificationService.handleMoneyTransferred(event);
        }
    )

    console.log('✅ Notification context setup complete')
}