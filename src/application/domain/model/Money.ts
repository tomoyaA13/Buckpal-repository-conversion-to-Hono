/**
 * お金を表す値オブジェクト
 * 不変（immutable）で、ビジネスロジックをカプセル化
 */
export class Money {
  public static readonly ZERO = Money.of(0);

  private constructor(private readonly amount: bigint) {}

  /**
   * 数値からMoneyインスタンスを生成
   */
  static of(value: number | bigint): Money {
    return new Money(BigInt(value));
  }

  /**
   * 金額が正の値かどうか
   */
  isPositive(): boolean {
    return this.amount > 0n;
  }

  /**
   * 金額が0または正の値かどうか
   */
  isPositiveOrZero(): boolean {
    return this.amount >= 0n;
  }

  /**
   * 金額が負の値かどうか
   */
  isNegative(): boolean {
    return this.amount < 0n;
  }

  /**
   * 他のMoneyより大きいかどうか
   */
  isGreaterThan(other: Money): boolean {
    return this.amount > other.amount;
  }

  /**
   * 他のMoney以上かどうか
   */
  isGreaterThanOrEqualTo(other: Money): boolean {
    return this.amount >= other.amount;
  }

  /**
   * 2つのMoneyを加算
   */
  static add(a: Money, b: Money): Money {
    return new Money(a.amount + b.amount);
  }

  /**
   * このMoneyに別のMoneyを加算
   */
  plus(other: Money): Money {
    return Money.add(this, other);
  }

  /**
   * 2つのMoneyを減算
   */
  static subtract(a: Money, b: Money): Money {
    return new Money(a.amount - b.amount);
  }

  /**
   * このMoneyから別のMoneyを減算
   */
  minus(other: Money): Money {
    return Money.subtract(this, other);
  }

  /**
   * 符号を反転
   */
  negate(): Money {
    return new Money(-this.amount);
  }

  /**
   * 金額を取得
   */
  getAmount(): bigint {
    return this.amount;
  }

  /**
   * 等価性チェック
   */
  equals(other: Money): boolean {
    return this.amount === other.amount;
  }

  /**
   * 文字列表現
   */
  toString(): string {
    return this.amount.toString();
  }
}
