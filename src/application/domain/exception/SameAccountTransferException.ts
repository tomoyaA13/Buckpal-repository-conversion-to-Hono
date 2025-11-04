// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SameAccountTransferException（同一アカウント送金例外）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 【この例外クラスの目的】
// - 同じアカウント間での送金を試みた場合に投げられる例外
// - 無意味な操作を防ぐ
//
// 【なぜ同一アカウント送金を禁止？】
// 1. ビジネス的に無意味
//    - 自分から自分へ送金しても残高は変わらない
//    - 手数料だけ取られる可能性がある
//
// 2. システム的に問題になる可能性
//    - トランザクションログが汚れる
//    - デッドロックの原因になる可能性
//    - 監査が複雑になる
//
// 3. ユーザーの誤操作を防ぐ
//    - 送金先を間違えた可能性が高い
//    - 早期に気づかせる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {AccountId} from '../model/Activity';

/**
 * 同一アカウント送金例外
 *
 * 【発生条件】
 * sourceAccountId === targetAccountId
 *
 * 【例】
 * アカウント12345 から アカウント12345 へ送金しようとする
 * → この例外が投げられる
 */
export class SameAccountTransferException extends Error {
    /**
     * 送金元と送金先が同じアカウントのID
     *
     * 【なぜ1つのプロパティだけ？】
     * - 送金元と送金先が同じなので、1つのIDだけ持てば十分
     * - threshold と actual のように2つの情報を比較する必要がない
     *
     * 【使い道】
     * - ログに記録: "アカウント12345で同一送金を試みました"
     * - ユーザーに通知: "アカウント12345への送金はできません"
     */
    public readonly accountId: AccountId;

    /**
     * コンストラクタ
     *
     * 【呼び出し例】
     * if (sourceAccountId.equals(targetAccountId)) {
     *     throw new SameAccountTransferException(sourceAccountId);
     * }
     *
     * @param accountId 送金元・送金先のアカウントID（同じID）
     */
    constructor(accountId: AccountId) {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // super() で親クラス（Error）を初期化
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // エラーメッセージの例:
        // "Cannot transfer money to the same account: 12345"
        //
        // 【メッセージのポイント】
        // 1. 何が問題か明確（同じアカウントへの送金）
        // 2. どのアカウントか明記（12345）
        // 3. シンプルで理解しやすい
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        super(
            `Cannot transfer money to the same account: ${accountId.getValue().toString()}`
        );

        // エラーの種類を識別する名前
        this.name = 'SameAccountTransferException';

        // アカウントIDを保存
        this.accountId = accountId;
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 使い方の例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 【ドメインサービスでの使用例】
// SendMoneyDomainService.ts:
//
// executeTransfer(
//     sourceAccount: Account,
//     targetAccount: Account,
//     money: Money,
//     threshold: Money
// ): void {
//     const sourceAccountId = sourceAccount.getId();
//     const targetAccountId = targetAccount.getId();
//
//     // ビジネスルール: 同一アカウント送金を禁止
//     if (sourceAccountId.equals(targetAccountId)) {
//         throw new SameAccountTransferException(sourceAccountId);
//     }
//     // 送金処理...
// }
//
// 【Web層でのエラーハンドリング】
// SendMoneyController.ts:
//
// try {
//     await sendMoneyUseCase.sendMoney(command);
//     return c.json({ success: true }, 200);
// } catch (error) {
//     if (error instanceof SameAccountTransferException) {
//         return c.json({
//             success: false,
//             message: '同じアカウントへは送金できません',
//             error: {
//                 code: 'SAME_ACCOUNT_TRANSFER',
//                 details: {
//                     accountId: error.accountId.getValue().toString(),
//                 }
//             }
//         }, 400);
//     }
// }
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━