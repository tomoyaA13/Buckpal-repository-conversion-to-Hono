import { container } from 'tsyringe'
import type { EventBus } from '../common/event/EventBus'
import { setupNotificationContext } from '../notification/config/setup'
import type { CloudflareBindings } from '../types/bindings'
import { setupContainer } from './container'
import { EventBusToken } from './types'

/**
 * アプリケーション全体の初期化
 *
 * 【責務】
 * 1. DIコンテナの設定（setupContainer）
 * 2. 各コンテキストの初期化（setupXxxContext）
 *
 * 【メリット】
 * - 初期化処理が一目で分かる
 * - 各コンテキストが独立して初期化できる
 * - テストしやすい
 */

let isInitialized = false

export function initializeApplication(env: CloudflareBindings): void {
    if (isInitialized) {
        return
    }

    console.log('🚀 Initializing application...')

    // ① DIコンテナの設定
    setupContainer(env)

    // ② EventBusを取得
    const eventBus = container.resolve<EventBus>(EventBusToken)

    // ③ 各コンテキストの初期化
    setupNotificationContext(eventBus, container)

    // 将来的に他のコンテキストも追加
    // setupAuditContext(eventBus, container)
    // setupAnalyticsContext(eventBus, container)

    isInitialized = true
    console.log('✅ Application initialized')
}

export function resetApplication(): void {
    isInitialized = false
    console.log('🔄 Application reset')
}