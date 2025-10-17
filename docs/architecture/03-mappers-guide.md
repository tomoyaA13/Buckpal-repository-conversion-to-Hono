# マッパーの実装ガイド

## 📖 概要

このドキュメントでは、双方向でのモデルの変換を実現するマッパークラスの実装方法、ベストプラクティス、よくある間違いについて説明します。

## 🎯 マッパーの役割

マッパーは、異なる層のモデル間でデータを変換する責務を持ちます。

```
Web層のモデル ←→ [マッパー] ←→ ドメインモデル ←→ [マッパー] ←→ 永続化層のモデル
```

### マッパーが持つべき責務

✅ **持つべき責務:**
- モデル間のデータ変換
- 型の変換（`string` → `BigInt` など）
- 構造の変換（フラット ↔ ネスト）

❌ **持つべきでない責務:**
- ビジネスロジック
- バリデーション（ドメイン層で行うべき）
- データの取得や保存（リポジトリの責務）

---

## 🌐 SendMoneyMapper の解説

### 概要

`SendMoneyMapper` は、Web層とアプリケーション層の境界でモデルを変換します。

### 実装

```typescript
// src/adapter/in/web/mappers/SendMoneyMapper.ts

import { SendMoneyWebRequest } from '../models/SendMoneyWebRequest';
import { SendMoneyWebResponse } from '../models/SendMoneyWebResponse';
import { SendMoneyCommand } from '../../../../application/port/in/SendMoneyCommand';
import { AccountId } from '../../../../application/domain/model/Activity';
import { Money } from '../../../../application/domain/model/Money';

export class SendMoneyMapper {
  /**
   * WebリクエストをSendMoneyCommandに変換
   * 
   * Web層の文字列データをドメイン層の値オブジェクトに変換
   */
  static toCommand(request: SendMoneyWebRequest): SendMoneyCommand {
    try {
      const sourceAccountId = new AccountId(BigInt(request.sourceAccountId));
      const targetAccountId = new AccountId(BigInt(request.targetAccountId));
      const money = Money.of(BigInt(request.amount));

      return new SendMoneyCommand(sourceAccountId, targetAccountId, money);
    } catch (error) {
      throw new Error(
        `Failed to map web request to command: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * 成功レスポンスを作成
   */
  static toSuccessResponse(
    request: SendMoneyWebRequest,
    timestamp: Date = new Date()
  ): SendMoneyWebResponse {
    return {
      success: true,
      message: 'Money transfer completed successfully',
      data: {
        sourceAccountId: request.sourceAccountId,
        targetAccountId: request.targetAccountId,
        amount: request.amount,
        timestamp: timestamp.toISOString(),
      },
    };
  }

  /**
   * エラーレスポンスを作成
   */
  static toErrorResponse(
    message: string,
    code: string,
    details?: Record<string, any>
  ): SendMoneyWebResponse {
    return {
      success: false,
      message,
      error: {
        code,
        details,
      },
    };
  }
}
```

### 重要なポイント

#### 1. ステートレスなクラス

```typescript
export class SendMoneyMapper {
  // ❌ BAD: インスタンス変数を持つ
  private timestamp: Date;
  
  // ✅ GOOD: すべてstaticメソッド
  static toCommand(request: SendMoneyWebRequest): SendMoneyCommand { ... }
}
```

マッパーはステートレスであるべきです。すべてのメソッドを `static` にすることで、インスタンス化の必要がなく、テストも容易になります。

#### 2. エラーハンドリング

```typescript
try {
  const sourceAccountId = new AccountId(BigInt(request.sourceAccountId));
  // ...
} catch (error) {
  throw new Error(
    `Failed to map web request to command: ${error instanceof Error ? error.message : 'Unknown error'}`
  );
}
```

変換に失敗した場合は、わかりやすいエラーメッセージを含む例外をスローします。

#### 3. 命名規則

- `toCommand()`: Web層のモデル → ドメインコマンド
- `toSuccessResponse()`: 成功時のレスポンス生成
- `toErrorResponse()`: エラー時のレスポンス生成

---

## 💾 AccountMapper の解説

### 概要

`AccountMapper` は、永続化層とドメイン層の境界でモデルを変換します。

### 実装

```typescript
// src/adapter/out/persistence/mappers/AccountMapper.ts

import { Account } from '../../../../application/domain/model/Account';
import { AccountId, Activity, ActivityId } from '../../../../application/domain/model/Activity';
import { ActivityWindow } from '../../../../application/domain/model/ActivityWindow';
import { Money } from '../../../../application/domain/model/Money';
import { AccountAggregateEntity } from '../entities/AccountEntity';
import { ActivityEntity, PersistedActivityEntity } from '../entities/ActivityEntity';

export class AccountMapper {
  /**
   * DBエンティティをドメインモデルに変換
   */
  static toDomain(aggregate: AccountAggregateEntity): Account {
    const accountId = new AccountId(BigInt(aggregate.account.id));
    const baselineBalance = Money.of(BigInt(aggregate.baselineBalance));

    // アクティビティエンティティをドメインモデルに変換
    const activities = aggregate.activities.map((activityEntity) =>
      this.activityToDomain(activityEntity)
    );

    const activityWindow = new ActivityWindow(...activities);

    return Account.withId(accountId, baselineBalance, activityWindow);
  }

  /**
   * ActivityエンティティをActivityドメインモデルに変換
   */
  private static activityToDomain(entity: PersistedActivityEntity): Activity {
    return Activity.withId(
      new ActivityId(BigInt(entity.id)),
      new AccountId(BigInt(entity.owner_account_id)),
      new AccountId(BigInt(entity.source_account_id)),
      new AccountId(BigInt(entity.target_account_id)),
      new Date(entity.timestamp),
      Money.of(BigInt(entity.amount))
    );
  }

  /**
   * ドメインモデルからDBエンティティへの変換
   * 
   * 新しいアクティビティのみを抽出してエンティティに変換
   */
  static toActivityEntities(account: Account): ActivityEntity[] {
    const newActivities = account
      .getActivityWindow()
      .getActivities()
      .filter((activity) => !activity.getId()); // IDがない = 新規アクティビティ

    return newActivities.map((activity) => this.activityToEntity(activity));
  }

  /**
   * ActivityドメインモデルをActivityエンティティに変換
   */
  private static activityToEntity(activity: Activity): ActivityEntity {
    return {
      // idは自動採番されるため、指定しない
      timestamp: activity.getTimestamp().toISOString(),
      owner_account_id: Number(activity.getOwnerAccountId().getValue()),
      source_account_id: Number(activity.getSourceAccountId().getValue()),
      target_account_id: Number(activity.getTargetAccountId().getValue()),
      amount: Number(activity.getMoney().getAmount()),
    };
  }

  /**
   * ベースライン残高を計算するためのヘルパー
   */
  static calculateBaselineBalance(
    activities: PersistedActivityEntity[],
    accountId: number
  ): bigint {
    let balance = 0n;

    for (const activity of activities) {
      if (activity.owner_account_id !== accountId) {
        continue;
      }

      // 入金の場合は加算
      if (activity.target_account_id === accountId) {
        balance += BigInt(activity.amount);
      }

      // 出金の場合は減算
      if (activity.source_account_id === accountId) {
        balance -= BigInt(activity.amount);
      }
    }

    return balance;
  }
}
```

### 重要なポイント

#### 1. 集約の再構成

```typescript
static toDomain(aggregate: AccountAggregateEntity): Account {
  // 1. 値オブジェクトの生成
  const accountId = new AccountId(BigInt(aggregate.account.id));
  const baselineBalance = Money.of(BigInt(aggregate.baselineBalance));

  // 2. コレクションの変換
  const activities = aggregate.activities.map((e) => this.activityToDomain(e));

  // 3. 集約ルートの構築
  const activityWindow = new ActivityWindow(...activities);
  return Account.withId(accountId, baselineBalance, activityWindow);
}
```

集約を再構成する際は、以下の順序で行います：
1. 値オブジェクトの生成
2. コレクションの変換
3. 集約ルートの構築

#### 2. 新規アクティビティのみを抽出

```typescript
static toActivityEntities(account: Account): ActivityEntity[] {
  const newActivities = account
    .getActivityWindow()
    .getActivities()
    .filter((activity) => !activity.getId()); // IDがない = 新規

  return newActivities.map((activity) => this.activityToEntity(activity));
}
```

`getId()` が `null` のアクティビティは、まだDBに保存されていない新規アクティビティです。これらのみをエンティティに変換してDBに挿入します。

#### 3. プライベートヘルパーメソッド

```typescript
private static activityToDomain(entity: PersistedActivityEntity): Activity {
  // 変換ロジック
}

private static activityToEntity(activity: Activity): ActivityEntity {
  // 変換ロジック
}
```

複雑な変換ロジックは、プライベートヘルパーメソッドに切り出すことで、コードの可読性が向上します。

#### 4. 命名規則

- `toDomain()`: DBエンティティ → ドメインモデル
- `toActivityEntities()` / `toEntity()`: ドメインモデル → DBエンティティ
- `calculateBaselineBalance()`: ヘルパーメソッド

---

## 📝 マッパー実装のベストプラクティス

### 1. マッパーはステートレスにする

```typescript
// ✅ GOOD: ステートレス
export class MyMapper {
  static toDomain(entity: Entity): Domain { ... }
  static toEntity(domain: Domain): Entity { ... }
}

// ❌ BAD: ステートフル
export class MyMapper {
  private cache: Map<string, Domain> = new Map();
  
  toDomain(entity: Entity): Domain { ... }
}
```

### 2. すべてのメソッドを static にする

```typescript
// ✅ GOOD
MyMapper.toDomain(entity);

// ❌ BAD
const mapper = new MyMapper();
mapper.toDomain(entity);
```

### 3. 変換ロジックにビジネスロジックを含めない

```typescript
// ❌ BAD: ビジネスロジックを含む
static toDomain(entity: AccountEntity): Account {
  const account = new Account(entity.id);
  
  // ビジネスルール: 残高が0未満なら例外
  if (account.calculateBalance() < 0) {
    throw new Error('Negative balance not allowed');
  }
  
  return account;
}

// ✅ GOOD: 純粋に変換のみ
static toDomain(aggregate: AccountAggregateEntity): Account {
  const accountId = new AccountId(BigInt(aggregate.account.id));
  const baselineBalance = Money.of(BigInt(aggregate.baselineBalance));
  // ... 変換のみ
  return Account.withId(accountId, baselineBalance, activityWindow);
}
```

ビジネスルールは、ドメインモデル自体に含めるべきです。

### 4. エラーハンドリングを適切に行う

```typescript
// ✅ GOOD: わかりやすいエラーメッセージ
static toCommand(request: SendMoneyWebRequest): SendMoneyCommand {
  try {
    const sourceAccountId = new AccountId(BigInt(request.sourceAccountId));
    // ...
  } catch (error) {
    throw new Error(
      `Failed to map web request to command: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ❌ BAD: エラーを握りつぶす
static toCommand(request: SendMoneyWebRequest): SendMoneyCommand {
  try {
    const sourceAccountId = new AccountId(BigInt(request.sourceAccountId));
    // ...
  } catch (error) {
    return null; // エラーを無視
  }
}
```

### 5. 一貫性のある命名規則を使う

| メソッド名 | 用途 | 例 |
|-----------|------|-----|
| `toCommand()` | Web → ドメイン（コマンド） | `toCommand(request)` |
| `toResponse()` | ドメイン → Web（レスポンス） | `toSuccessResponse(...)` |
| `toDomain()` | エンティティ → ドメイン | `toDomain(aggregate)` |
| `toEntity()` / `toEntities()` | ドメイン → エンティティ | `toActivityEntities(account)` |

### 6. 複雑な変換はヘルパーメソッドに切り出す

```typescript
// ✅ GOOD: 複雑な変換をヘルパーに切り出し
export class AccountMapper {
  static toDomain(aggregate: AccountAggregateEntity): Account {
    const activities = aggregate.activities.map((e) => this.activityToDomain(e));
    // ...
  }

  private static activityToDomain(entity: PersistedActivityEntity): Activity {
    // 複雑な変換ロジック
  }
}

// ❌ BAD: すべてを1つのメソッドに詰め込む
export class AccountMapper {
  static toDomain(aggregate: AccountAggregateEntity): Account {
    const activities = aggregate.activities.map((e) => {
      // 長い変換ロジックがインラインで書かれている...
    });
  }
}
```

### 7. 双方向に変換できるようにする

```typescript
// ✅ GOOD: 双方向変換が可能
export class MyMapper {
  static toDomain(entity: Entity): Domain { ... }
  static toEntity(domain: Domain): Entity { ... }
}

// ⚠️ 注意: 完全に可逆的である必要はない
// 情報の損失は許容される（例：計算値は保存しない）
```

### 8. テストしやすい構造にする

```typescript
// ✅ GOOD: 各メソッドが独立してテスト可能
describe('AccountMapper', () => {
  describe('toDomain', () => {
    it('should convert entity to domain model', () => {
      const entity = createTestEntity();
      const domain = AccountMapper.toDomain(entity);
      expect(domain.getId()?.getValue()).toBe(1n);
    });
  });

  describe('toActivityEntities', () => {
    it('should extract new activities only', () => {
      const account = createTestAccount();
      const entities = AccountMapper.toActivityEntities(account);
      expect(entities).toHaveLength(2);
    });
  });
});
```

---

## ⚠️ よくある間違いと対処法

### 間違い1: マッパーにビジネスロジックを含める

```typescript
// ❌ BAD
static toDomain(entity: AccountEntity): Account {
  const account = new Account(entity.id);
  
  // ビジネスロジック: 残高が1000未満なら手数料を追加
  if (account.getBalance() < 1000) {
    account.addFee(100);
  }
  
  return account;
}
```

**対処法:** ビジネスロジックはドメインモデルに移動する

```typescript
// ✅ GOOD
class Account {
  applyMonthlyFee(): void {
    if (this.calculateBalance() < 1000) {
      this.addFee(Money.of(100n));
    }
  }
}
```

### 間違い2: インスタンス変数を持つマッパー

```typescript
// ❌ BAD
export class MyMapper {
  private timestamp: Date;
  
  constructor() {
    this.timestamp = new Date();
  }
  
  toResponse(data: Data): Response {
    return { data, timestamp: this.timestamp };
  }
}
```

**対処法:** すべてのメソッドを `static` にして、必要な値は引数で渡す

```typescript
// ✅ GOOD
export class MyMapper {
  static toResponse(data: Data, timestamp: Date = new Date()): Response {
    return { data, timestamp: timestamp.toISOString() };
  }
}
```

### 間違い3: エラーを握りつぶす

```typescript
// ❌ BAD
static toDomain(entity: Entity): Domain | null {
  try {
    return new Domain(entity.id);
  } catch (error) {
    return null; // エラーを無視
  }
}
```

**対処法:** エラーは適切にスローする

```typescript
// ✅ GOOD
static toDomain(entity: Entity): Domain {
  try {
    return new Domain(entity.id);
  } catch (error) {
    throw new Error(`Failed to map entity to domain: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

### 間違い4: 循環変換を行う

```typescript
// ❌ BAD
static toDomain(entity: Entity): Domain {
  const domain = new Domain(entity.id);
  // ドメインモデルをエンティティに変換してから、また戻す
  const newEntity = this.toEntity(domain);
  return this.toDomain(newEntity); // 無限ループの可能性
}
```

**対処法:** 変換は一方向のみ行い、循環させない

---

## 🧪 テストの書き方

### ユニットテスト例

```typescript
// src/adapter/in/web/mappers/SendMoneyMapper.test.ts

import { SendMoneyMapper } from './SendMoneyMapper';
import { SendMoneyWebRequest } from '../models/SendMoneyWebRequest';

describe('SendMoneyMapper', () => {
  describe('toCommand', () => {
    it('should convert web request to command', () => {
      // Arrange
      const request: SendMoneyWebRequest = {
        sourceAccountId: '1',
        targetAccountId: '2',
        amount: '1000',
      };

      // Act
      const command = SendMoneyMapper.toCommand(request);

      // Assert
      expect(command.sourceAccountId.getValue()).toBe(1n);
      expect(command.targetAccountId.getValue()).toBe(2n);
      expect(command.money.getAmount()).toBe(1000n);
    });

    it('should throw error for invalid input', () => {
      // Arrange
      const request: SendMoneyWebRequest = {
        sourceAccountId: 'invalid',
        targetAccountId: '2',
        amount: '1000',
      };

      // Act & Assert
      expect(() => SendMoneyMapper.toCommand(request)).toThrow();
    });
  });

  describe('toSuccessResponse', () => {
    it('should create success response', () => {
      // Arrange
      const request: SendMoneyWebRequest = {
        sourceAccountId: '1',
        targetAccountId: '2',
        amount: '1000',
      };
      const timestamp = new Date('2025-01-01T00:00:00Z');

      // Act
      const response = SendMoneyMapper.toSuccessResponse(request, timestamp);

      // Assert
      expect(response.success).toBe(true);
      expect(response.data?.sourceAccountId).toBe('1');
      expect(response.data?.timestamp).toBe('2025-01-01T00:00:00.000Z');
    });
  });
});
```

---

## 🔗 関連ドキュメント

- [01-mapping-strategy.md](./01-mapping-strategy.md) - 双方向モデル変換の概要
- [02-layer-models.md](./02-layer-models.md) - 各層のモデルの詳細
- [04-strategy-comparison.md](./04-strategy-comparison.md) - 3つの戦略の比較
