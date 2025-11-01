import type {AccountId} from '../model/Activity';
import type {Money} from '../model/Money';

export class InsufficientBalanceException extends Error {
    constructor(
        public readonly accountId: AccountId,
        public readonly attemptedAmount: Money,
        public readonly currentBalance: Money
    ) {
        super(
            `Insufficient balance in account ${accountId.getValue().toString()}: ` +
            `attempted to withdraw ${attemptedAmount.getAmount().toString()}, ` +
            `but current balance is ${currentBalance.getAmount().toString()}`
        );
        this.name = 'InsufficientBalanceException';
    }
}