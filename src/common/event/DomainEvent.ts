
/**
 * ドメインイベントの基底インターフェース
 *
 * 【ドメインイベントとは？】
 * ドメイン（業務領域）で発生した重要な出来事を表すオブジェクト。
 *
 * 例：
 * - MoneyTransferredEvent: 送金が完了した
 * - AccountCreatedEvent: 口座が作成された
 * - UserRegisteredEvent: ユーザーが登録された
 *
 * 【なぜイベントを使うのか？】
 * 境界づけられたコンテキスト間の疎結合な連携を実現するため。
 *
 * 直接呼び出しの場合（強い結合）:
 * ```
 * SendMoneyService → NotificationService.send()
 *                    ↑ 直接依存している
 * ```
 *
 * イベント駆動の場合（疎結合）:
 * ```
 * SendMoneyService → イベント発行 → EventBus → NotificationService
 *                                    ↑ 間接的な連携
 * ```
 */
export interface DomainEvent {
    /**
     * イベントの一意な識別子
     * 同じイベントが複数回処理されることを防ぐために使用
     */
    readonly eventId: string

    /**
     * イベントが発生した日時
     * イベントソーシングやイベントストアで重要
     */
    readonly occurredOn: Date

    /**
     * イベントの種類を示す文字列
     * EventBusがどのハンドラーを呼ぶか判断するために使用
     *
     * 例: 'MoneyTransferred', 'AccountCreated'
     */
    readonly eventType: string
}