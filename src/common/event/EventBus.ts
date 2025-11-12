import { inject, injectable } from 'tsyringe'
import { EventStorePortToken } from '../../config/types'
import type { DomainEvent } from './DomainEvent'
import type { EventStorePort } from './port/EventStorePort'

/**
 * イベントハンドラーの型定義
 *
 * イベントを受け取って非同期処理を行う関数の型。
 *
 * @template T - 処理するイベントの型（DomainEvent のサブタイプである必要がある）
 *
 * @param event - 処理対象のイベント
 * @returns Promise<void> - 非同期処理の完了を表す Promise（戻り値なし）
 *
 * @example
 * ```typescript
 * const handler: EventHandler<MoneyTransferredEvent> = async (event) => {
 *   await notificationService.sendEmail(event)
 * }
 * ```
 */
export type EventHandler<T extends DomainEvent> = (event: T) => Promise<void>

/**
 * イベントバス（Pub/Sub パターンの実装）
 *
 * 【役割】
 * - イベントの発行（publish）
 * - イベントの購読（subscribe）
 * - イベントとハンドラーの紐付け管理
 * - イベントストアへの永続化
 *
 * 【メリット】
 * 1. 発行者と購読者が互いを知らない（疎結合）
 * 2. 複数の購読者を簡単に追加できる（拡張性）
 * 3. イベント駆動アーキテクチャの実現
 * 4. イベントの永続化による監査・デバッグ能力
 *
 * 【使用例】
 * ```typescript
 * // DIコンテナから取得
 * const eventBus = container.resolve<EventBus>(EventBusToken)
 *
 * // イベントを購読
 * eventBus.subscribe<MoneyTransferredEvent>(
 *         'MoneyTransferred',
 *         (event) => notificationService.handleMoneyTransferred(event)
 *     )
 *
 * // イベントを発行
 * await eventBus.publish(new MoneyTransferredEvent(...))
 * ```
 */
@injectable()
export class EventBus {
    /**
     * イベントタイプごとのハンドラーを管理
     *
     * キー: イベントタイプ（例: 'MoneyTransferred'）
     * 値: ハンドラーの配列（複数の購読者をサポート）
     *
     * 【型パラメータ DomainEvent について】
     * EventHandler<DomainEvent> を使うことで：
     * - any を避けて型安全性を保つ
     * - 全てのドメインイベントを受け入れる柔軟性を持つ
     */
    private eventTypeToHandlers = new Map<string, EventHandler<DomainEvent>[]>()

    /**
     * イベントストア（オプショナル）
     *
     * 【なぜオプショナルか】
     * - 下位互換性を保つため
     * - テスト環境でイベントストアなしでも動作させるため
     * - イベントストアの初期化が失敗してもEventBusは動作すべきため
     */
    private readonly eventStore?: EventStorePort

    /**
     * コンストラクタ
     *
     * @param eventStore イベントストア（DIコンテナから自動注入）
     *
     * 【DIパターン】
     * @injectable() デコレータにより、tsyringeがこのクラスを管理
     * @inject(EventStorePortToken) により、EventStorePortが自動注入される
     *
     * 【利点】
     * - container.ts で手動インスタンス化が不要
     * - テスト時はモックを注入できる
     * - 依存関係の解決が自動化される
     */
    constructor(
        @inject(EventStorePortToken) eventStore?: EventStorePort
    ) {
        this.eventStore = eventStore

        if (eventStore) {
            console.log('✅ EventBus initialized with EventStore')
        } else {
            console.log('⚠️  EventBus initialized without EventStore (events will not be persisted)')
        }
    }

    /**
     * イベントを購読する
     *
     * @param eventType イベントの種類（例: 'MoneyTransferred'）
     * @param handler イベント発生時に実行する関数
     *
     * @example
     * ```typescript
     * eventBus.subscribe<MoneyTransferredEvent>(
     *         'MoneyTransferred',
     *         (event) => notificationService.handleMoneyTransferred(event)
     *     )
     * ```
     */
    subscribe<T extends DomainEvent>(
        eventType: string,
        handler: EventHandler<T>
    ): void {
        // nullish coalescing (??) を使用
        // undefined または null の場合のみ空配列を返す
        // || では 0, '', false なども空配列になってしまう
        const handlers = this.eventTypeToHandlers.get(eventType) ?? []

        handlers.push(handler as EventHandler<DomainEvent>)
        this.eventTypeToHandlers.set(eventType, handlers)

        console.log(`📝 Subscribed to event: ${eventType}`)
    }

    /**
     * イベントを発行する
     *
     * @param event 発行するイベント
     *
     * 【動作フロー】
     * 1. イベントストアに保存（失敗してもハンドラー実行は継続）
     * 2. イベントタイプに対応するハンドラーを全て取得
     * 3. 全てのハンドラーを並列実行
     * 4. 1つでも失敗したらエラーをログに記録（ただし処理は継続）
     *
     * 【イベントストアへの保存タイミング】
     * ハンドラー実行「前」に保存する理由：
     * - ハンドラーが失敗してもイベントは記録される（監査ログとして重要）
     * - イベントソーシングの観点では、イベントの発生自体が重要
     * - ハンドラーの実行結果はイベントの発生とは独立
     *
     * @example
     * ```typescript
     * const event = new MoneyTransferredEvent(...)
     * await eventBus.publish(event)
     * ```
     */
    async publish(event: DomainEvent): Promise<void> {
        console.log(`📤 Publishing event: ${event.eventType} (ID: ${event.eventId})`)

        // ① イベントストアに保存（あれば）
        if (this.eventStore) {
            try {
                await this.eventStore.save(event)
                console.log(`💾 Event persisted to store: ${event.eventId}`)
            } catch (error) {
                // イベントストアへの保存失敗はログに記録するが、
                // ハンドラーの実行は継続する（イベントストアの障害が
                // ビジネスロジックを止めないようにするため）
                console.error(
                    `❌ Failed to persist event to store (continuing with handlers): ${event.eventId}`,
                    error
                )
            }
        }

        // ② ハンドラーの取得
        const handlers = this.eventTypeToHandlers.get(event.eventType) ?? []

        if (handlers.length === 0) {
            console.log(`⚠️  No handlers for event: ${event.eventType}`)
            return
        }

        // ③ 全てのハンドラーを並列実行
        const results = await Promise.allSettled(
            handlers.map((handler) => handler(event))
        )

        // ④ エラーをログに記録（ただし処理は継続）
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(
                    `❌ Handler ${String(index)} failed for event ${event.eventType}:`,
                    result.reason
                )
            }
        })
    }

    /**
     * 全てのハンドラーをクリア（主にテスト用）
     */
    clear(): void {
        this.eventTypeToHandlers.clear()
        console.log('🗑️  EventBus cleared')
    }
}