import { inject, injectable } from 'tsyringe'
import type { TypedSupabaseClient } from '../../../config/types'
import { SupabaseClientToken } from '../../../config/types'
import type { DomainEvent } from '../DomainEvent'
import type { EventStorePort } from '../port/EventStorePort'

/**
 * Supabaseを使ったイベントストアの実装
 *
 * 【役割】
 * - ドメインイベントをSupabaseのdomain_eventsテーブルに保存
 * - 保存されたイベントを検索・取得
 *
 * 【実装のポイント】
 * 1. イベントをJSONB形式で保存
 *    - JSONBはPostgreSQLの効率的なJSON型
 *    - インデックスを作成して高速検索が可能
 *
 * 2. イベントの復元
 *    - データベースから取得したJSONをDomainEventに復元
 *    - 現時点ではプレーンオブジェクトとして返す
 *    - 将来的にはファクトリーパターンで具体的なイベントクラスに復元可能
 *
 * 3. エラーハンドリング
 *    - Supabaseのエラーを適切にログ出力
 *    - 上位層に例外を伝播
 */
@injectable()
export class SupabaseEventStoreAdapter implements EventStorePort {
    constructor(
        @inject(SupabaseClientToken)
        private readonly supabaseClient: TypedSupabaseClient
    ) {}

    /**
     * イベントを保存
     *
     * 【処理の流れ】
     * 1. DomainEventをデータベース用の形式に変換
     * 2. domain_eventsテーブルにINSERT
     * 3. エラーがあればログ出力して例外をthrow
     */
    async save(event: DomainEvent): Promise<void> {
        try {
            // イベントデータをJSONB用に準備
            //
            // 【重要】スプレッド演算子の順序について
            // 1. まず ...event でイベント全体をスプレッド
            // 2. その後 occurredOn を上書きして Date → string に変換
            //
            // これにより:
            // - eventId, eventType は event から自動的に含まれる
            // - occurredOn だけが ISO文字列に変換される
            // - その他のイベント固有プロパティ（amount, sourceAccountId等）も含まれる
            const eventData = {
                ...event,
                occurredOn: event.occurredOn.toISOString(),
            }

            const { error } = await this.supabaseClient
                .from('domain_events')
                .insert({
                    event_id: event.eventId,
                    event_type: event.eventType,
                    occurred_on: event.occurredOn.toISOString(),
                    event_data: eventData,
                })

            if (error) {
                console.error('❌ Failed to save event to store:', error)
                throw new Error(`Failed to save event: ${error.message}`)
            }

            console.log(`💾 Event saved to store: ${event.eventType} (ID: ${event.eventId})`)
        } catch (error) {
            console.error('❌ Unexpected error saving event:', error)
            throw error
        }
    }

    /**
     * イベントIDでイベントを取得
     */
    async findById(eventId: string): Promise<DomainEvent | null> {
        try {
            const { data, error } = await this.supabaseClient
                .from('domain_events')
                .select('*')
                .eq('event_id', eventId)
                .single()

            if (error) {
                // NOT FOUNDエラーは正常なケースなのでログレベルを下げる
                if (error.code === 'PGRST116') {
                    console.log(`ℹ️  Event not found: ${eventId}`)
                    return null
                }
                console.error('❌ Failed to find event by ID:', error)
                throw new Error(`Failed to find event: ${error.message}`)
            }

            // データベースから取得したデータをDomainEventに変換
            return this.deserializeEvent(data.event_data as Record<string, unknown>)
        } catch (error) {
            console.error('❌ Unexpected error finding event by ID:', error)
            throw error
        }
    }

    /**
     * イベントタイプでイベントを検索
     */
    async findByType(eventType: string, limit = 100): Promise<DomainEvent[]> {
        try {
            const { data, error } = await this.supabaseClient
                .from('domain_events')
                .select('*')
                .eq('event_type', eventType)
                .order('occurred_on', { ascending: false })
                .limit(limit)

            if (error) {
                console.error('❌ Failed to find events by type:', error)
                throw new Error(`Failed to find events: ${error.message}`)
            }

            if (data.length === 0) {
                return []
            }

            // 全てのイベントを復元
            return data.map((row) =>
                this.deserializeEvent(row.event_data as Record<string, unknown>)
            )
        } catch (error) {
            console.error('❌ Unexpected error finding events by type:', error)
            throw error
        }
    }

    /**
     * 期間を指定してイベントを検索
     */
    async findByDateRange(
        startDate: Date,
        endDate: Date,
        eventType?: string,
        limit = 100
    ): Promise<DomainEvent[]> {
        try {
            let query = this.supabaseClient
                .from('domain_events')
                .select('*')
                .gte('occurred_on', startDate.toISOString())
                .lte('occurred_on', endDate.toISOString())

            // イベントタイプが指定されている場合はフィルタリング
            if (eventType) {
                query = query.eq('event_type', eventType)
            }

            const { data, error } = await query
                .order('occurred_on', { ascending: false })
                .limit(limit)

            if (error) {
                console.error('❌ Failed to find events by date range:', error)
                throw new Error(`Failed to find events: ${error.message}`)
            }

            if (data.length === 0) {
                return []
            }

            return data.map((row) =>
                this.deserializeEvent(row.event_data as Record<string, unknown>)
            )
        } catch (error) {
            console.error('❌ Unexpected error finding events by date range:', error)
            throw error
        }
    }

    /**
     * JSONからDomainEventオブジェクトに復元
     *
     * 【現在の実装】
     * プレーンオブジェクトとして返す。
     * eventId, occurredOn, eventType を含むオブジェクトを作成。
     *
     * 【将来的な拡張】
     * イベントファクトリーパターンを使用して、
     * event_typeに基づいて適切な具体的クラス（MoneyTransferredEventなど）を
     * インスタンス化することも可能。
     *
     * @private
     */
    private deserializeEvent(eventData: Record<string, unknown>): DomainEvent {
        return {
            eventId: eventData.eventId as string,
            occurredOn: new Date(eventData.occurredOn as string),
            eventType: eventData.eventType as string,
            // その他のプロパティもそのまま含める
            ...eventData,
        } as DomainEvent
    }
}