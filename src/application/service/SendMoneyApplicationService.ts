import {inject, injectable} from 'tsyringe';
import {ThresholdExceededException} from '../domain/exception/ThresholdExceededException';
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
 */
@injectable()
export class SendMoneyApplicationService implements SendMoneyUseCase {
    /**
     * @inject が必要な理由:
     * - TypeScriptの型情報（LoadAccountPort）→ interface なので実行時に消える（コンテナが LoadAccountPort interface が必要と言われても存在しないのでわからない）
     * - トークン（LoadAccountPortToken）→ Symbol なので実行時に存在する
     * - @inject → 「型の代わりにこのトークンを使って」という指示
     *
     * 注: SendMoneyDomainService はクラスだが、統一性のため全ての依存に @inject を使用
     */
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
     */
    async sendMoney(command: SendMoneyCommand): Promise<boolean> {
        // ① 事前検証: 限度額チェック
        if (!this.domainService.isWithinThreshold(
            command.money,
            this.moneyTransferProperties.maximumTransferThreshold)) {
            throw new ThresholdExceededException(
                this.moneyTransferProperties.maximumTransferThreshold,
                command.money
            );
        }

        // ② データ取得: アカウントをロード
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

        // ③ リソースロック
        this.accountLock.lockAccount(sourceAccountId);
        this.accountLock.lockAccount(targetAccountId);

        try {
            // ④ ビジネスロジック実行（ドメインサービスに委譲）
            const success = this.domainService.executeTransfer(
                sourceAccount,
                targetAccount,
                command.money
            );

            if (!success) {
                return false;
            }

            // ⑤ 永続化: アカウント状態を更新
            await this.updateAccountStatePort.updateActivities(sourceAccount);
            await this.updateAccountStatePort.updateActivities(targetAccount);

            return true;
        } finally {
            // ⑥ リソース解放（必ず実行）
            this.accountLock.releaseAccount(sourceAccountId);
            this.accountLock.releaseAccount(targetAccountId);
        }
    }
}
