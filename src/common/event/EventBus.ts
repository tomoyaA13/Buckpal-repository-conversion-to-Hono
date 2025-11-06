import type {DomainEvent} from "./DomainEvent";


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
 *
 * 【メリット】
 * 1. 発行者と購読者が互いを知らない（疎結合）
 * 2. 複数の購読者を簡単に追加できる（拡張性）
 * 3. イベント駆動アーキテクチャの実現
 *
 * 【使用例】
 * ```typescript
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
    //                                                        ^^^^^^^^^^^
    //                                                        any → DomainEvent に変更

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
        //                                                        ^^
        //                                                        || → ?? に変更

        handlers.push(handler as EventHandler<DomainEvent>)
        this.eventTypeToHandlers.set(eventType, handlers)

        console.log(`📝 Subscribed to event: ${eventType}`)
    }

    /**
     * イベントを発行する
     *
     * @param event 発行するイベント
     *
     * 【動作】
     * 1. イベントタイプに対応するハンドラーを全て取得
     * 2. 全てのハンドラーを並列実行
     * 3. 1つでも失敗したらエラーをログに記録（ただし処理は継続）
     *
     * @example
     * ```typescript
     * const event = new MoneyTransferredEvent(...)
     * await eventBus.publish(event)
     * ```
     */
    async publish(event: DomainEvent): Promise<void> {
        //            ^^^^^^^^^^^^^^^^^^^^^
        //            ジェネリック型パラメータを削除
        //            DomainEvent で十分（型パラメータは1回しか使われていないため）

        const handlers = this.eventTypeToHandlers.get(event.eventType) ?? []
        //                                                              ^^
        //                                                              || → ?? に変更

        if (handlers.length === 0) {
            console.log(`⚠️  No handlers for event: ${event.eventType}`)
            return
        }

        console.log(`📤 Publishing event: ${event.eventType} (ID: ${event.eventId})`)

        // 全てのハンドラーを並列実行
        const results = await Promise.allSettled(
            handlers.map(handler => handler(event))
        )

        // エラーをログに記録（ただし処理は継続）
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(
                    `❌ Handler ${String(index)} failed for event ${event.eventType}:`,
                    //            ^^^^^^^^^^^^
                    //            index を明示的に文字列に変換
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