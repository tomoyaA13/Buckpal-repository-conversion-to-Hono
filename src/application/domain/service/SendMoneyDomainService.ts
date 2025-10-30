import {injectable} from 'tsyringe';
import {SameAccountTransferException} from "../exception/SameAccountTransferException";
import {Account} from '../model/Account';
import {Money} from '../model/Money';


/**
 * 送金ドメインサービス(このドメインサービスは「送金の手順」という純粋なビジネスロジックだけに集中)
 *
 * 役割: 純粋なビジネスロジックのみを実装
 * - ポート（インターフェース）を知らない
 * - フレームワークに依存しない
 * - ドメイン知識のみを扱う
 */
@injectable()
export class SendMoneyDomainService {
    /**
     * 送金トランザクションを実行
     *
     * @param sourceAccount 送金元アカウント
     * @param targetAccount 送金先アカウント
     * @param money 送金額
     * @returns 送金成功時true、失敗時false
     */
    executeTransfer(
        sourceAccount: Account,
        targetAccount: Account,
        money: Money
    ): boolean {
        const sourceAccountId = sourceAccount.getId();
        const targetAccountId = targetAccount.getId();

        if (!sourceAccountId || !targetAccountId) {
            throw new Error('Account ID must not be empty');
        }

        // ✅ ビジネスルール0: 同一アカウント間の送金を禁止
        //
        // 【なぜドメインサービスに配置？】
        // - 特定のアカウントに紐づかない（送金全体のルール）
        // - ビジネスの専門家と議論できる
        //   「同じアカウント間の送金を許可すべきですか？」→ 業務上の判断
        // - 他のビジネスルール（限度額チェック）と同じ性質
        //
        // 【判断基準の適用】
        // 銀行員に「同一アカウント送金を許可すべきですか」と質問できる
        // → これは業務上の意思決定事項
        // → ドメインサービスに配置すべき
        if (sourceAccountId.equals(targetAccountId)) {
            throw new SameAccountTransferException(sourceAccountId);
        }

        // ビジネスルール1: 送金元から引き出し
        if (!sourceAccount.withdraw(money, targetAccountId)) {
            return false;
        }

        // ビジネスルール2: 送金先に入金
        if (!targetAccount.deposit(money, sourceAccountId)) {
            // ロールバック: 引き出しを取り消し
            sourceAccount.deposit(money, targetAccountId);
            return false;
        }

        return true;
    }

    // 特定のアカウントに紐づくものではなく、送金というユースケース全体に関わるルールであるため、
    // ドメインサービスに配置されています。

    // 判断基準：ビジネスの専門家と議論できるか
    // ドメインサービスとアプリケーションサービスのどちらに配置すべきか迷ったとき、有効な判断基準があります。
    // それは、「そのロジックについて、ビジネスの専門家（銀行員や業務担当者）と議論できるか」という基準です。
    // 送金限度額について、銀行員に「一回の送金の限度額は100万円で良いですか、それとも200万円に変更すべきですか」
    // と質問できます。これは意味のある質問であり、銀行員は業務の観点から答えられます。だから、これはドメインサービスに
    // 配置すべきビジネスルールです。
    // 一方、「送金処理のトランザクション分離レベルはREAD COMMITTEDで良いですか」と銀行員に質問しても、意味が通じません。
    // これは技術的な実装の詳細であり、ビジネスの本質とは無関係です。だから、これはアプリケーションサービスに配置すべき技術的な調整です。

    // 手数料の計算方法について、銀行員に「送金額の何パーセントを手数料にすべきですか」と質問できます。これは業務上の重要な決定事項です。
    // だから、手数料計算ロジックはドメインサービスに配置すべきです。
    // しかし、「手数料のデータを、どのテーブルに保存すべきですか」と銀行員に聞いても、答えられません。これはデータベース設計という
    // 技術的な問題です。だから、データの保存方法はアプリケーションサービスやインフラストラクチャ層で扱うべきです。
    /**
     * 送金額が限度額を超えていないかチェック
     *
     * @param amount 送金額
     * @param threshold 限度額
     * @returns 限度額以内ならtrue
     */
    isWithinThreshold(amount: Money, threshold: Money): boolean {
        return !amount.isGreaterThan(threshold);
    }
}