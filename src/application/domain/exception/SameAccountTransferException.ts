import type { AccountId } from '../model/Activity';

/**
 * 同一アカウント間の送金を試みた場合にスローされる例外
 *
 * 【ビジネスルール】
 * 同じアカウント内での送金は無意味な操作であり、
 * システムとして禁止すべきビジネスルールです。
 *
 * 【なぜドメイン層で検証？】
 * - これはビジネスルール（ドメイン知識）であり、技術的な制約ではない
 * - どのインターフェース（Web、CLI、バッチ等）からアクセスしても同じルールが適用されるべき
 * - Value Objectである SendMoneyCommand は、不正な状態を持つべきではない
 *
 * 【例外の使用場面】
 * - SendMoneyCommand の生成時に検証
 * - Web層でキャッチして 400 Bad Request を返す
 */
export class SameAccountTransferException extends Error {
  constructor(public readonly accountId: AccountId) {
    super(
      `Cannot transfer money to the same account: account ID ${accountId.toString()}`
    );
    this.name = 'SameAccountTransferException';
  }
}
