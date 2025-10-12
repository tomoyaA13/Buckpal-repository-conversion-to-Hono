import { Money } from './Money';

/**
 * アクティビティID（値オブジェクト）
 */
export class ActivityId {
  constructor(private readonly value: bigint) {}

  getValue(): bigint {
    return this.value;
  }

  equals(other: ActivityId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value.toString();
  }
}

/**
 * アカウントID（値オブジェクト）
 */
export class AccountId {
  constructor(private readonly value: bigint) {}

  getValue(): bigint {
    return this.value;
  }

  equals(other: AccountId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value.toString();
  }
}

/**
 * アカウント間の送金活動を表すエンティティ
 * アクティビティはアカウント間でお金が移動した記録
 */
export class Activity {
  constructor(
    private readonly id: ActivityId | null,
    private readonly ownerAccountId: AccountId,
    private readonly sourceAccountId: AccountId,
    private readonly targetAccountId: AccountId,
    private readonly timestamp: Date,
    private readonly money: Money
  ) {}

  /**
   * IDなしでActivityを生成（新規作成時）
   */
  static withoutId(
    ownerAccountId: AccountId,
    sourceAccountId: AccountId,
    targetAccountId: AccountId,
    timestamp: Date,
    money: Money
  ): Activity {
    return new Activity(
      null,
      ownerAccountId,
      sourceAccountId,
      targetAccountId,
      timestamp,
      money
    );
  }

  /**
   * IDありでActivityを生成（DB再構成時）
   */
  static withId(
    id: ActivityId,
    ownerAccountId: AccountId,
    sourceAccountId: AccountId,
    targetAccountId: AccountId,
    timestamp: Date,
    money: Money
  ): Activity {
    return new Activity(
      id,
      ownerAccountId,
      sourceAccountId,
      targetAccountId,
      timestamp,
      money
    );
  }

  getId(): ActivityId | null {
    return this.id;
  }

  getOwnerAccountId(): AccountId {
    return this.ownerAccountId;
  }

  getSourceAccountId(): AccountId {
    return this.sourceAccountId;
  }

  getTargetAccountId(): AccountId {
    return this.targetAccountId;
  }

  getTimestamp(): Date {
    return this.timestamp;
  }

  getMoney(): Money {
    return this.money;
  }
}
