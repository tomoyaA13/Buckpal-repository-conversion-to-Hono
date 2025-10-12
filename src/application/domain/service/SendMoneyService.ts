import {inject, injectable} from 'tsyringe';
import {SendMoneyUseCase} from '../../port/in/SendMoneyUseCase';
import {SendMoneyCommand} from '../../port/in/SendMoneyCommand';
import {LoadAccountPort, LoadAccountPortToken,} from '../../port/out/LoadAccountPort';
import {UpdateAccountStatePort, UpdateAccountStatePortToken,} from '../../port/out/UpdateAccountStatePort';
import {AccountLock, AccountLockToken,} from '../../port/out/AccountLock';
import {MoneyTransferProperties, MoneyTransferPropertiesToken,} from './MoneyTransferProperties';
import {ThresholdExceededException} from './ThresholdExceededException';


// 依存関係の向き(永続化層がドメイン層に依存する)
// 永続化層（adapter/out/persistence）
//     ↓ 依存(実装)
// ドメイン層のインターフェース（application/port/out）
//     ↑ 依存
// ドメイン層のサービス（application/domain/service）
//     ↓ 依存
// ドメイン層のエンティティ（application/domain/model）

/**
 * 送金ユースケースの実装
 * ヘキサゴナルアーキテクチャのドメインサービス層
 */
@injectable()
export class SendMoneyService implements SendMoneyUseCase {
    constructor(
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
     * 送金を実行
     *
     * ビジネスロジック:
     * 1. 送金額が限度額を超えていないかチェック
     * 2. 送金元と送金先のアカウントをロード
     * 3. 送金元アカウントをロック
     * 4. 送金元から引き出し
     * 5. 送金先アカウントをロック
     * 6. 送金先に入金
     * 7. アカウント状態を更新
     * 8. ロックを解放
     */
    async sendMoney(command: SendMoneyCommand): Promise<boolean> {
        // 1. 限度額チェック
        this.checkThreshold(command);

        // 2. 基準日を設定（10日前）
        const baselineDate = new Date();
        baselineDate.setDate(baselineDate.getDate() - 10);

        // 3. アカウントをロード
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

        // 4. 送金元アカウントをロックして引き出し
        this.accountLock.lockAccount(sourceAccountId);

        if (!sourceAccount.withdraw(command.money, targetAccountId)) {
            this.accountLock.releaseAccount(sourceAccountId);
            return false;
        }

        // 5. 送金先アカウントをロックして入金
        this.accountLock.lockAccount(targetAccountId);

        if (!targetAccount.deposit(command.money, sourceAccountId)) {
            this.accountLock.releaseAccount(sourceAccountId);
            this.accountLock.releaseAccount(targetAccountId);
            return false;
        }

        // 6. アカウント状態を更新
        await this.updateAccountStatePort.updateActivities(sourceAccount);
        await this.updateAccountStatePort.updateActivities(targetAccount);

        // 7. ロックを解放
        this.accountLock.releaseAccount(sourceAccountId);
        this.accountLock.releaseAccount(targetAccountId);

        return true;
    }

    /**
     * 送金額が限度額を超えていないかチェック
     */
    private checkThreshold(command: SendMoneyCommand): void {
        if (
            command.money.isGreaterThan(
                this.moneyTransferProperties.maximumTransferThreshold
            )
        ) {
            throw new ThresholdExceededException(
                this.moneyTransferProperties.maximumTransferThreshold,
                command.money
            );
        }
    }
}
