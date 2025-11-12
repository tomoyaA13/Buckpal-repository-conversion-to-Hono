import { injectable } from 'tsyringe'
import type { DomainEvent } from '../DomainEvent'
import type { EventStorePort } from '../port/EventStorePort'

/**
 * インメモリ実装のイベントストア
 *
 * 【用途】
 * - 開発環境でのクイックテスト
 * - 単体テスト・統合テスト
 * - データベースなしでの動作確認
 *
 * 【特徴】
 * - メモリ上にイベントを保存（アプリ再起動で消える）
 * - データベース不要で高速
 * - テストで簡単にリセット可能
 *
 * 【注意】
 * - 本番環境では使用しない
 * - プロセスをまたいで共有できない
 * - メモリ制限があるため大量データには不向き
 */
@injectable()
export class InMemoryEventStoreAdapter implements EventStorePort {
    /**
     * イベントを保存するMap
     * key: eventId
     * value: DomainEvent
     */
    private readonly events = new Map<string, DomainEvent>()

    /**
     * イベントを保存
     *
     * 【実装】
     * InMemory実装では非同期処理が不要なため、asyncを使用せず
     * Promise.resolve()で即座に解決されるPromiseを返す。
     */
    save(event: DomainEvent): Promise<void> {
        // イベントIDの重複チェック
        if (this.events.has(event.eventId)) {
            console.warn(`⚠️  Event already exists: ${event.eventId}`)
            // 冪等性を保つため、エラーにはしない
            return Promise.resolve()
        }

        // Mapに保存
        this.events.set(event.eventId, event)

        console.log(`💾 [InMemory] Event saved: ${event.eventType} (ID: ${event.eventId})`)
        return Promise.resolve()
    }

    /**
     * イベントIDでイベントを取得
     */
    findById(eventId: string): Promise<DomainEvent | null> {
        const event = this.events.get(eventId)

        if (!event) {
            console.log(`ℹ️  [InMemory] Event not found: ${eventId}`)
            return Promise.resolve(null)
        }

        return Promise.resolve(event)
    }

    /**
     * イベントタイプでイベントを検索
     */
    findByType(eventType: string, limit = 100): Promise<DomainEvent[]> {
        // 全イベントからフィルタリング
        const filtered = Array.from(this.events.values()).filter(
            (event) => event.eventType === eventType
        )

        // 発生日時の降順でソート
        const sorted = filtered.sort(
            (a, b) => b.occurredOn.getTime() - a.occurredOn.getTime()
        )

        // limit件まで取得
        return Promise.resolve(sorted.slice(0, limit))
    }

    /**
     * 期間を指定してイベントを検索
     */
    findByDateRange(
        startDate: Date,
        endDate: Date,
        eventType?: string,
        limit = 100
    ): Promise<DomainEvent[]> {
        // 全イベントから期間でフィルタリング
        let filtered = Array.from(this.events.values()).filter((event) => {
            const occurredTime = event.occurredOn.getTime()
            const startTime = startDate.getTime()
            const endTime = endDate.getTime()

            return occurredTime >= startTime && occurredTime <= endTime
        })

        // イベントタイプが指定されている場合は追加フィルタリング
        if (eventType) {
            filtered = filtered.filter((event) => event.eventType === eventType)
        }

        // 発生日時の降順でソート
        const sorted = filtered.sort(
            (a, b) => b.occurredOn.getTime() - a.occurredOn.getTime()
        )

        // limit件まで取得
        return Promise.resolve(sorted.slice(0, limit))
    }

    /**
     * 全てのイベントをクリア（テスト用）
     */
    clear(): void {
        this.events.clear()
        console.log('🗑️  [InMemory] All events cleared')
    }

    /**
     * 保存されているイベント数を取得（テスト用）
     */
    size(): number {
        return this.events.size
    }
}