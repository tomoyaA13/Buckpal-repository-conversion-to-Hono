// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// InsufficientBalanceException（残高不足例外）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 【この例外クラスの目的】
// - 銀行口座の残高が不足している場合に投げられる例外
// - 「なぜ失敗したか」の詳細情報を保持する
// - 呼び出し側が適切なエラーメッセージをユーザーに表示できる
//
// 【なぜカスタム例外が必要？】
// 通常のErrorクラスだと：
//   throw new Error("残高不足");
//   → メッセージしか持てない
//   → 具体的な残高や試行金額がわからない
//
// カスタム例外なら：
//   throw new InsufficientBalanceException(accountId, 1000円, 500円);
//   → アカウントID、試行金額、現在残高がすべてわかる
//   → 呼び出し側で詳細なエラーメッセージを作れる
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {AccountId} from '../model/Activity';
import type {Money} from '../model/Money';

/**
 * 残高不足例外
 *
 * 【extends Error とは？】
 * - Error: JavaScriptが標準で提供するエラークラス
 * - extends: 「継承」を意味する（親クラスの機能を引き継ぐ）
 * - つまり：「Errorクラスの機能を持ちつつ、独自の機能を追加する」
 *
 * 【Errorクラスが持っている機能】
 * 1. message: エラーメッセージ（文字列）
 * 2. name: エラーの種類を表す名前（例: "Error", "TypeError"）
 * 3. stack: エラーが発生した場所のスタックトレース（デバッグ用）
 *
 * 【なぜ extends Error を使う？】
 * - try-catch で捕捉できる（JavaScript の標準的な仕組み）
 * - instanceof で型チェックできる
 * - スタックトレースが自動的に記録される（どこでエラーが起きたかわかる）
 *
 * 【比較】
 * ❌ 普通のクラス:
 *    class MyError { message: string; }
 *    → try-catch で捕捉できない
 *    → instanceof Error が false になる
 *
 * ✅ Error を継承:
 *    class MyError extends Error { ... }
 *    → try-catch で捕捉できる
 *    → instanceof Error が true になる
 *    → JavaScript のエラー処理の標準に従う
 */
export class InsufficientBalanceException extends Error {
    /**
     * 【プロパティの説明】
     *
     * この3つの情報を持つことで、呼び出し側が詳細なエラーメッセージを作れる
     *
     * 例：
     * "アカウント12345の残高は500円です。1000円の送金はできません。"
     *  ↑
     *  accountId    ↑              ↑
     *               currentBalance  attemptedAmount
     */

    /**
     * エラーが発生したアカウントのID
     *
     * 【なぜ必要？】
     * - 複数のアカウントを扱う場合、どのアカウントでエラーが起きたか特定できる
     * - ログに記録するときに便利
     */
    public readonly accountId: AccountId;

    /**
     * 引き出そうとした金額
     *
     * 【なぜ必要？】
     * - ユーザーがいくら送金しようとしたかわかる
     * - 「1000円の送金はできません」というメッセージを作れる
     */
    public readonly attemptedAmount: Money;

    /**
     * 現在の残高
     *
     * 【なぜ必要？】
     * - 「現在の残高は500円です」というメッセージを作れる
     * - ユーザーが「あといくら必要か」を計算できる
     */
    public readonly currentBalance: Money;

    /**
     * コンストラクタ（インスタンス作成時に呼ばれる）
     *
     * 【呼び出し例】
     * throw new InsufficientBalanceException(
     *     new AccountId(123),    // どのアカウントか
     *     Money.of(1000),        // いくら引き出そうとしたか
     *     Money.of(500)          // 実際の残高はいくらか
     * );
     *
     * @param accountId 残高不足が発生したアカウントID
     * @param attemptedAmount 引き出そうとした金額
     * @param currentBalance 現在の残高
     */
    constructor(
        accountId: AccountId,
        attemptedAmount: Money,
        currentBalance: Money
    ) {
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // super() の説明
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // 【super とは？】
        // - 親クラス（Error）のコンストラクタを呼び出す
        // - extends を使った場合、必ず最初に super() を呼ぶ必要がある
        //
        // 【なぜ必要？】
        // - Error クラスの初期化処理を実行する必要がある
        // - message や stack などの基本的な機能を使えるようにする
        //
        // 【引数の意味】
        // super() に渡す文字列 → Error.message に格納される
        // この文字列は：
        // - コンソールに出力される
        // - ログファイルに記録される
        // - デバッグ時に役立つ
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        super(
            // エラーメッセージを作成
            // テンプレート文字列（バッククォート）を使って、変数を埋め込む
            `Insufficient balance in account ${accountId.getValue().toString()}: ` +
            `attempted to withdraw ${attemptedAmount.getAmount().toString()}, ` +
            `but current balance is ${currentBalance.getAmount().toString()}`
        );

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // this.name の説明
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // 【name プロパティの役割】
        // - エラーの種類を識別するための名前
        // - コンソールやログに表示される
        //
        // 【設定しないとどうなる？】
        // this.name を設定しないと "Error" になる
        //
        // 【設定するメリット】
        // コンソール出力:
        //   ❌ Error: Insufficient balance...
        //   ✅ InsufficientBalanceException: Insufficient balance...
        //      ↑ 一目でどの例外かわかる
        //
        // instanceof チェック:
        //   if (error instanceof InsufficientBalanceException) {
        //       // この例外専用の処理
        //   }
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        this.name = 'InsufficientBalanceException';

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // プロパティに値を保存
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        //
        // 【なぜ保存？】
        // - 呼び出し側でこの情報にアクセスできるようにする
        // - エラーハンドリング時に詳細情報を使える
        //
        // 【使い方の例】
        // try {
        //     account.withdraw(Money.of(1000), targetId);
        // } catch (error) {
        //     if (error instanceof InsufficientBalanceException) {
        //         console.log(`アカウントID: ${error.accountId.value}`);
        //         console.log(`試行金額: ${error.attemptedAmount.getAmount()}`);
        //         console.log(`現在残高: ${error.currentBalance.getAmount()}`);
        //     }
        // }
        //
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        this.accountId = accountId;
        this.attemptedAmount = attemptedAmount;
        this.currentBalance = currentBalance;
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 使い方の例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 【ドメイン層での使用例】
// Account.ts の withdraw() メソッド内:
//
// withdraw(money: Money, targetAccountId: AccountId): void {
//     if (!this.mayWithdraw(money)) {
//         // 残高不足の場合、例外を投げる
//         throw new InsufficientBalanceException(
//             this.id,
//             money,
//             this.calculateBalance()
//         );
//     }
//     // 引き出し処理...
// }
//
// 【Web層でのエラーハンドリング】
// SendMoneyController.ts:
//
// try {
//     await sendMoneyUseCase.sendMoney(command);
//     return c.json({ success: true }, 200);
// } catch (error) {
//     if (error instanceof InsufficientBalanceException) {
//         return c.json({
//             success: false,
//             message: '残高不足です',
//             error: {
//                 code: 'INSUFFICIENT_BALANCE',
//                 details: {
//                     accountId: error.accountId.getValue().toString(),
//                     attemptedAmount: error.attemptedAmount.getAmount().toString(),
//                     currentBalance: error.currentBalance.getAmount().toString(),
//                 }
//             }
//         }, 400);
//     }
// }
//
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━