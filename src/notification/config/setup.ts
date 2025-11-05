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
        (event) => notificationService.handleMoneyTransferred(event)
    )

    console.log('✅ Notification context setup complete')
}