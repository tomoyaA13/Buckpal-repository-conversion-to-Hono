import {injectable} from 'tsyringe';
import {SameAccountTransferException} from '../exception/SameAccountTransferException';
import {ThresholdExceededException} from '../exception/ThresholdExceededException';
import {Account} from '../model/Account';
import {Money} from '../model/Money';

/**
 * 送金ドメインサービス（ビジネスルールの集約）
 *
 * 役割: 純粋なビジネスロジックのみを実装
 * - ポート（インターフェース）を知らない
 * - フレームワークに依存しない
 * - ドメイン知識のみを扱う
 * - すべての送金ビジネスルールを集約
 */
@injectable()
export class SendMoneyDomainService {
    /**
     * 送金トランザクションを実行
     *
     * @throws SameAccountTransferException 同一アカウント送金の場合
     * @throws ThresholdExceededException 限度額超過の場合
     * @throws InsufficientBalanceException 残高不足の場合
     */
    executeTransfer(
        sourceAccount: Account,
        targetAccount: Account,
        money: Money,
        threshold: Money
    ): void {
        const sourceAccountId = sourceAccount.getId();
        const targetAccountId = targetAccount.getId();

        if (!sourceAccountId || !targetAccountId) {
            throw new Error('Account ID must not be empty');
        }

        // ビジネスルール1: 同一アカウント間の送金を禁止
        if (sourceAccountId.equals(targetAccountId)) {
            throw new SameAccountTransferException(sourceAccountId);
        }

        // ビジネスルール2: 送金限度額のチェック
        if (money.isGreaterThan(threshold)) {
            throw new ThresholdExceededException(threshold, money);
        }

        // ビジネスルール3: 送金元から引き出し（残高チェック含む）
        sourceAccount.withdraw(money, targetAccountId);

        // ビジネスルール4: 送金先に入金
        targetAccount.deposit(money, sourceAccountId);
    }
}

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 判断基準：ビジネスの専門家と議論できるか
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    //
    // ドメインサービスとアプリケーションサービスのどちらに配置すべきか
    // 迷ったとき、有効な判断基準があります。それは、「そのロジックについて、
    // ビジネスの専門家（銀行員や業務担当者）と議論できるか」という基準です。
    //
    // ✅ ドメインサービスに配置すべき例:
    // - 「同一アカウント送金を許可すべきですか？」
    // - 「一回の送金の限度額は100万円で良いですか？」
    // - 「手数料は送金額の何パーセントにすべきですか？」
    // → これらは意味のある質問で、銀行員は業務の観点から答えられる
    //
    // ❌ アプリケーションサービスに配置すべき例:
    // - 「送金処理のトランザクション分離レベルはREAD COMMITTEDで良いですか？」
    // - 「手数料のデータを、どのテーブルに保存すべきですか？」
    // → これらは技術的な実装の詳細で、銀行員には意味が通じない
