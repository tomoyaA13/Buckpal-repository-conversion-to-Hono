import type { Money } from '../model/Money';

/**
 * 送金限度額を超えた場合にスローされる例外
 */
export class ThresholdExceededException extends Error {
  constructor(
    public readonly threshold: Money,
    public readonly actual: Money
  ) {
    super(
      `Maximum threshold for transferring money exceeded: tried to transfer ${actual.toString()} but threshold is ${threshold.toString()}!`
    );
    this.name = 'ThresholdExceededException';
  }
}
