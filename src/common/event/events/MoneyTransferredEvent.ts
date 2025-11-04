

import type {AccountId} from "../../../account/application/domain/model/Activity";
import type { Money } from '../../../account/application/domain/model/Money'
import type { DomainEvent } from '../DomainEvent'

/**
 * 送金完了イベント
 *
 * 【いつ発行されるか】
 * SendMoneyApplicationService で送金が成功した時
 *
 * 【誰が購読するか】
 * - NotificationService: メール通知を送る
 * - AuditLogService: 監査ログに記録（将来の拡張）
 * - AnalyticsService: 分析データを収集（将来の拡張）
 */
export class MoneyTransferredEvent implements DomainEvent {
    readonly eventId: string
    readonly occurredOn: Date
    readonly eventType = 'MoneyTransferred'

    constructor(
        public readonly sourceAccountId: AccountId,
        public readonly targetAccountId: AccountId,
        public readonly amount: Money
    ) {
        this.eventId = crypto.randomUUID()
        this.occurredOn = new Date()
    }
}