import { Money } from '../model/Money';

/**
 * 送金ユースケースの設定プロパティ
 */
export class MoneyTransferProperties {
  constructor(public readonly maximumTransferThreshold: Money) {}
}

/**
 * DI用のシンボル
 */
export const MoneyTransferPropertiesToken = Symbol('MoneyTransferProperties');
