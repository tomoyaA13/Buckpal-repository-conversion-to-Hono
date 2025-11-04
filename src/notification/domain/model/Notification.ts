/**
 * 通知ドメインモデル
 *
 * シンプルな実装（将来的に拡張可能）
 */
export class Notification {
    constructor(
        public readonly recipientEmail: string,
        public readonly subject: string,
        public readonly content: NotificationContent
    ) {}
}

/**
 * 通知内容（値オブジェクト）
 */
export class NotificationContent {
    constructor(
        public readonly sourceAccountId: string,
        public readonly targetAccountId: string,
        public readonly amount: string
    ) {}
}