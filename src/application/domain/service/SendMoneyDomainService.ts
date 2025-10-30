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
     * @param sourceAccount 送金元アカウント
     * @param targetAccount 送金先アカウント
     * @param money 送金額
     * @param threshold 送金限度額
     * @returns 送金成功時true、失敗時false
     */
    executeTransfer(
        sourceAccount: Account,
        targetAccount: Account,
        money: Money,
        threshold: Money
    ): boolean {
        const sourceAccountId = sourceAccount.getId();
        const targetAccountId = targetAccount.getId();

        if (!sourceAccountId || !targetAccountId) {
            throw new Error('Account ID must not be empty');
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 送金ビジネスルールの検証（ドメインサービスに集約）
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // ✅ ビジネスルール1: 同一アカウント間の送金を禁止
        //
        // 【なぜドメインサービスに配置？】
        // - 特定のアカウントに紐づかない（送金全体のルール）
        // - ビジネスの専門家と議論できる
        //   銀行員への質問: 「同じアカウント間の送金を許可すべきですか？」
        //   → 業務上の判断が必要 → ドメインサービスに配置
        if (sourceAccountId.equals(targetAccountId)) {
            throw new SameAccountTransferException(sourceAccountId);
        }

        // ✅ ビジネスルール2: 送金限度額のチェック
        //
        // 【なぜドメインサービスに配置？】
        // - 特定のアカウントに紐づかない（送金全体のポリシー）
        // - ビジネスの専門家と議論できる
        //   銀行員への質問: 「一回の送金の限度額は100万円で良いですか？」
        //   → 業務上の判断が必要 → ドメインサービスに配置
        if (money.isGreaterThan(threshold)) {
            throw new ThresholdExceededException(threshold, money);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 送金トランザクションの実行
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // ビジネスロジック3: 送金元から引き出し
        // （残高チェックはAccount内部で実施）
        if (!sourceAccount.withdraw(money, targetAccountId)) {
            return false;
        }

        // ビジネスロジック4: 送金先に入金
        if (!targetAccount.deposit(money, sourceAccountId)) {
            // ロールバック: 引き出しを取り消し
            sourceAccount.deposit(money, targetAccountId);
            return false;
        }

        return true;
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
}