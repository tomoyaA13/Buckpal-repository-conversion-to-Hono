import {injectable} from 'tsyringe';
import {Account} from '../model/Account';
import {Money} from '../model/Money';
import {AccountId} from '../model/Account';

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

        // ビジネスロジック1: 送金元から引き出し
        if (!sourceAccount.withdraw(money, targetAccountId)) {
            return false;
        }

        // ビジネスロジック2: 送金先に入金
        if (!targetAccount.deposit(money, sourceAccountId)) {
            // ロールバック: 引き出しを取り消し
            sourceAccount.deposit(money, targetAccountId);
            return false;
        }

        return true;
    }

    // 特定のアカウントに紐づくものではなく、送金というユースケース全体に関わるルールであるため、
    // ドメインサービスに配置されています。
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
