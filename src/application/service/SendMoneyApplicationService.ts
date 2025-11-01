import {inject, injectable} from 'tsyringe';
import {MoneyTransferProperties, MoneyTransferPropertiesToken} from '../domain/service/MoneyTransferProperties';
import {SendMoneyDomainService} from '../domain/service/SendMoneyDomainService';
import {SendMoneyCommand} from '../port/in/SendMoneyCommand';
import {SendMoneyUseCase} from '../port/in/SendMoneyUseCase';
import {AccountLock, AccountLockToken} from '../port/out/AccountLock';
import {LoadAccountPort, LoadAccountPortToken} from '../port/out/LoadAccountPort';
import {UpdateAccountStatePort, UpdateAccountStatePortToken} from '../port/out/UpdateAccountStatePort';

/**
 * 送金アプリケーションサービス
 *
 * 役割: ユースケースの調整・オーケストレーション
 * - 受信ポート（SendMoneyUseCase）を実装
 * - 送信ポートを管理
 * - ドメインサービスを呼び出す
 * - トランザクション境界を定義
 *
 * 【責務の明確化】
 * - ビジネスルールの検証 → ドメインサービスに委譲 ✅
 * - データの取得・永続化 → このサービスで調整 ✅
 * - トランザクション管理 → このサービスで制御 ✅
 */
@injectable()
export class SendMoneyApplicationService implements SendMoneyUseCase {
    constructor(
        @inject(SendMoneyDomainService)
        private readonly domainService: SendMoneyDomainService,
        @inject(LoadAccountPortToken)
        private readonly loadAccountPort: LoadAccountPort,
        @inject(UpdateAccountStatePortToken)
        private readonly updateAccountStatePort: UpdateAccountStatePort,
        @inject(AccountLockToken)
        private readonly accountLock: AccountLock,
        @inject(MoneyTransferPropertiesToken)
        private readonly moneyTransferProperties: MoneyTransferProperties
    ) {
    }


    /**
     * 送金を実行（ユースケースの調整）
     *
     * @throws SameAccountTransferException 同一アカウント送金の場合
     * @throws ThresholdExceededException 限度額超過の場合
     * @throws InsufficientBalanceException 残高不足の場合
     * @throws Error その他のエラー
     */
    async sendMoney(command: SendMoneyCommand): Promise<void> {
        // ① データ取得: アカウントをロード
        const baselineDate = new Date();
        baselineDate.setDate(baselineDate.getDate() - 10);

        const sourceAccount = await this.loadAccountPort.loadAccount(
            command.sourceAccountId,
            baselineDate
        );

        const targetAccount = await this.loadAccountPort.loadAccount(
            command.targetAccountId,
            baselineDate
        );

        const sourceAccountId = sourceAccount.getId();
        const targetAccountId = targetAccount.getId();

        if (!sourceAccountId || !targetAccountId) {
            throw new Error('Expected account ID not to be empty');
        }

        // ② リソースロック
        this.accountLock.lockAccount(sourceAccountId);
        this.accountLock.lockAccount(targetAccountId);

        try {
            // ③ ビジネスロジック実行（例外が throw される）
            this.domainService.executeTransfer(
                sourceAccount,
                targetAccount,
                command.money,
                this.moneyTransferProperties.maximumTransferThreshold
            );

            // ④ 永続化: アカウント状態を更新
            await this.updateAccountStatePort.updateActivities(sourceAccount);
            await this.updateAccountStatePort.updateActivities(targetAccount);

            // ✅ 成功時は何も返さない（void）
        } finally {
            // ⑤ リソース解放（必ず実行）
            this.accountLock.releaseAccount(sourceAccountId);
            this.accountLock.releaseAccount(targetAccountId);
        }
    }
}