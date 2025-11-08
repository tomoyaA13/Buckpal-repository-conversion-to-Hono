import type { DomainEvent } from '../DomainEvent'

/**
 * イベントストアのポート（インターフェース）
 *
 * 【役割】
 * ドメインイベントを永続化し、後から取得できるようにする。
 *
 * 【目的】
 * 1. 監査ログ: 誰が、いつ、何をしたかを記録
 * 2. デバッグ: 過去のイベントを調査できる
 * 3. イベントソーシング: イベントからシステムの状態を再構築（将来的な拡張）
 * 4. 分析: ビジネスインサイトの獲得
 *
 * 【ヘキサゴナルアーキテクチャの観点】
 * - Application層はこのPortに依存
 * - 具体的な実装（Supabase/InMemory）は知らない
 * - テスト時は簡単にモックに差し替え可能
 */
export interface EventStorePort {
    /**
     * イベントを保存
     *
     * @param event 保存するドメインイベント
     * @throws Error 保存に失敗した場合
     *
     * @example
     * ```typescript
     * const event = new MoneyTransferredEvent(sourceId, targetId, amount)
     * await eventStore.save(event)
     * ```
     */
    save(event: DomainEvent): Promise<void>

    /**
     * イベントIDでイベントを取得
     *
     * @param eventId イベントの一意識別子
     * @returns イベントが見つかった場合はそのイベント、見つからない場合はnull
     *
     * @example
     * ```typescript
     * const event = await eventStore.findById('550e8400-e29b-41d4-a716-446655440000')
     * if (event) {
     *   console.log('イベント発見:', event.eventType)
     * }
     * ```
     */
    findById(eventId: string): Promise<DomainEvent | null>

    /**
     * イベントタイプでイベントを検索
     *
     * @param eventType イベントタイプ（例: 'MoneyTransferred'）
     * @param limit 取得する最大件数（デフォルト: 100）
     * @returns 該当するイベントの配列（新しい順）
     *
     * @example
     * ```typescript
     * const events = await eventStore.findByType('MoneyTransferred', 10)
     * console.log(`最新の送金イベント ${events.length}件`)
     * ```
     */
    findByType(eventType: string, limit?: number): Promise<DomainEvent[]>

    /**
     * 期間を指定してイベントを検索
     *
     * @param startDate 開始日時
     * @param endDate 終了日時
     * @param eventType イベントタイプ（省略可）
     * @param limit 取得する最大件数（デフォルト: 100）
     * @returns 該当するイベントの配列（新しい順）
     *
     * @example
     * ```typescript
     * const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
     * const now = new Date()
     * const events = await eventStore.findByDateRange(yesterday, now, 'MoneyTransferred')
     * console.log(`過去24時間の送金: ${events.length}件`)
     * ```
     */
    findByDateRange(
        startDate: Date,
        endDate: Date,
        eventType?: string,
        limit?: number
    ): Promise<DomainEvent[]>
}