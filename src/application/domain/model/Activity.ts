import type { Money } from './Money';

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
 *
 * アクティビティは以下の3種類を表現できる：
 * 1. 外部からの入金：source=null, target=アカウント（給与、ATM入金、初期残高）
 * 2. 外部への出金：source=アカウント, target=null（ATM出金、手数料）
 * 3. アカウント間送金：source=アカウント, target=アカウント（振込）
 */
export class Activity {
  /**
   * コンストラクタを private にすることで、
   * ファクトリーメソッド（withoutId, withId）経由でのみ生成可能にする
   *
   * 【利点】
   * - 生成方法を制御できる
   * - 意図が明確になる（新規 or 再構成）
   * - バリデーションを必ず通過させられる
   * - DDDのベストプラクティスに準拠
   */
  private constructor(
      private readonly id: ActivityId | null,
      private readonly ownerAccountId: AccountId,
      private readonly sourceAccountId: AccountId | null,
      private readonly targetAccountId: AccountId | null,
      private readonly timestamp: Date,
      private readonly money: Money
  ) {
    // バリデーション：少なくとも一方は非nullでなければならない
    if (sourceAccountId === null && targetAccountId === null) {
      throw new Error(
          'At least one of sourceAccountId or targetAccountId must be non-null'
      );
    }
  }

  /**
   * IDなしでActivityを生成（新規作成時）
   *
   * 【使用場面】
   * - Account.deposit() や Account.withdraw() で新しいアクティビティを作成する時
   * - まだDBに保存されていない状態
   *
   * @param ownerAccountId アクティビティの所有者アカウントID
   * @param sourceAccountId 送金元アカウントID（null=外部からの入金）
   * @param targetAccountId 送金先アカウントID（null=外部への出金）
   * @param timestamp アクティビティのタイムスタンプ
   * @param money 金額
   * @returns 新規Activityインスタンス（ID=null）
   */
  static withoutId(
      ownerAccountId: AccountId,
      sourceAccountId: AccountId | null,
      targetAccountId: AccountId | null,
      timestamp: Date,
      money: Money
  ): Activity {
    return new Activity(
        null,  // ← IDはnull（新規作成）
        ownerAccountId,
        sourceAccountId,
        targetAccountId,
        timestamp,
        money
    );
  }

  /**
   * IDありでActivityを生成（DB再構成時）
   *
   * 【使用場面】
   * - DBから取得したデータをドメインモデルに変換する時
   * - マッパー（ActivityMapper.toDomain）で使用
   *
   * @param id アクティビティID（DBから取得）
   * @param ownerAccountId アクティビティの所有者アカウントID
   * @param sourceAccountId 送金元アカウントID（null=外部からの入金）
   * @param targetAccountId 送金先アカウントID（null=外部への出金）
   * @param timestamp アクティビティのタイムスタンプ
   * @param money 金額
   * @returns 既存Activityインスタンス（IDあり）
   */
  static withId(
      id: ActivityId,
      ownerAccountId: AccountId,
      sourceAccountId: AccountId | null,
      targetAccountId: AccountId | null,
      timestamp: Date,
      money: Money
  ): Activity {
    return new Activity(
        id,  // ← IDあり（DB再構成）
        ownerAccountId,
        sourceAccountId,
        targetAccountId,
        timestamp,
        money
    );
  }

  // ========================================
  // Getter メソッド
  // ========================================

  getId(): ActivityId | null {
    return this.id;
  }

  getOwnerAccountId(): AccountId {
    return this.ownerAccountId;
  }

  getSourceAccountId(): AccountId | null {
    return this.sourceAccountId;
  }

  getTargetAccountId(): AccountId | null {
    return this.targetAccountId;
  }

  getTimestamp(): Date {
    return this.timestamp;
  }

  getMoney(): Money {
    return this.money;
  }

  // ========================================
  // ビジネスロジック（ヘルパーメソッド）
  // ========================================

  /**
   * 外部からの入金かどうかを判定
   *
   * 【パターン】source=null, target=アカウント
   * 【例】給与、ATM入金、初期残高設定
   *
   * @returns true if this is an external deposit
   */
  isExternalDeposit(): boolean {
    return this.sourceAccountId === null && this.targetAccountId !== null;
  }

  /**
   * 外部への出金かどうかを判定
   *
   * 【パターン】source=アカウント, target=null
   * 【例】ATM出金、手数料、税金
   *
   * @returns true if this is an external withdrawal
   */
  isExternalWithdrawal(): boolean {
    return this.sourceAccountId !== null && this.targetAccountId === null;
  }

  /**
   * アカウント間送金かどうかを判定
   *
   * 【パターン】source=アカウント, target=アカウント
   * 【例】振込、口座間移動
   *
   * @returns true if this is an inter-account transfer
   */
  isTransfer(): boolean {
    return this.sourceAccountId !== null && this.targetAccountId !== null;
  }

  /**
   * 指定したアカウントへの入金かどうかを判定
   *
   * @param accountId チェック対象のアカウントID
   * @returns true if this activity deposits money into the account
   */
  isDepositFor(accountId: AccountId): boolean {
    return this.targetAccountId?.equals(accountId) ?? false;
  }

  /**
   * 指定したアカウントからの出金かどうかを判定
   *
   * @param accountId チェック対象のアカウントID
   * @returns true if this activity withdraws money from the account
   */
  isWithdrawalFrom(accountId: AccountId): boolean {
    return this.sourceAccountId?.equals(accountId) ?? false;
  }
}