# 各層のモデル

## 📖 概要

双方向でのモデルの変換戦略では、各層が独自のモデルを持ちます。このドキュメントでは、各層のモデルの目的、責務、実装の詳細を説明します。

## 🏗️ 3つの層とそれぞれのモデル

```
┌─────────────────────────────────────────────────────────────┐
│                        Web層                                 │
│                                                              │
│  目的: HTTPリクエスト/レスポンスを表現                        │
│  特徴: プリミティブ型のみ、JSONシリアライズ可能                │
│                                                              │
│  例:                                                         │
│  - SendMoneyWebRequest                                       │
│  - SendMoneyWebResponse                                      │
└─────────────────────────────────────────────────────────────┘
                     ↕ SendMoneyMapper
┌─────────────────────────────────────────────────────────────┐
│                   アプリケーション層                          │
│                                                              │
│  目的: ビジネスロジックを表現                                 │
│  特徴: 値オブジェクト、不変性、ビジネスルール                  │
│                                                              │
│  例:                                                         │
│  - SendMoneyCommand                                          │
│  - Account, Activity, Money (ドメインモデル)                  │
└─────────────────────────────────────────────────────────────┘
                     ↕ AccountMapper
┌─────────────────────────────────────────────────────────────┐
│                     永続化層                                  │
│                                                              │
│  目的: データベースのテーブル構造を表現                        │
│  特徴: DBスキーマと1対1対応、プリミティブ型                    │
│                                                              │
│  例:                                                         │
│  - AccountEntity, ActivityEntity                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🌐 Web層のモデル

### 目的

- HTTPリクエスト/レスポンスを表現する
- JSONとの相互変換が容易
- Web APIのクライアント（フロントエンド）との契約

### 特徴

- **プリミティブ型のみ** (`string`, `number`, `boolean`)
- **JSONシリアライズ可能**
- **ドメインモデルへの依存がない**
- **バリデーションはZodなどのスキーマで行う**

### 実装例

#### SendMoneyWebRequest.ts

```typescript
import { z } from 'zod';

/**
 * Web層専用のリクエストモデル
 * プリミティブ型のみを使用してドメインモデルへの依存を排除
 */
export interface SendMoneyWebRequest {
  sourceAccountId: string;  // プリミティブ型
  targetAccountId: string;  // プリミティブ型
  amount: string;           // プリミティブ型（BigIntはJSONシリアライズできないため文字列）
}

/**
 * JSONスキーマバリデーション
 */
export const SendMoneyWebRequestSchema = z.object({
  sourceAccountId: z.string().regex(/^\d+$/, 'sourceAccountId must be a numeric string'),
  targetAccountId: z.string().regex(/^\d+$/, 'targetAccountId must be a numeric string'),
  amount: z.string().regex(/^\d+$/, 'amount must be a positive numeric string'),
});
```

#### SendMoneyWebResponse.ts

```typescript
/**
 * Web層専用のレスポンスモデル
 */
export interface SendMoneyWebResponse {
  success: boolean;
  message: string;
  data?: {
    sourceAccountId: string;
    targetAccountId: string;
    amount: string;
    timestamp: string;  // ISO 8601形式
  };
  error?: {
    code: string;
    details?: Record<string, any>;
  };
}
```

### なぜプリミティブ型のみなのか？

1. **JSONとの互換性**
   - Web APIはJSON形式でデータをやり取りする
   - プリミティブ型であれば、シリアライズ/デシリアライズが容易

2. **ドメインモデルへの依存排除**
   - Web層がドメインモデルに依存すると、ドメインモデルの変更がWeb APIに影響する
   - プリミティブ型を使うことで、完全に疎結合を実現

3. **API仕様の安定性**
   - APIクライアント（フロントエンド）は、安定したAPIインターフェースを期待する
   - プリミティブ型であれば、APIの形式を保ちながらドメインモデルを変更できる

---

## 🎯 アプリケーション層のモデル（ドメインモデル）

### 目的

- ビジネスロジックを表現する
- ビジネスルールを強制する
- 不変性を保証する

### 特徴

- **値オブジェクト** (`AccountId`, `Money`)
- **エンティティ** (`Account`, `Activity`)
- **不変性** (イミュータブル)
- **ビジネスルール** (バリデーション、制約)
- **型安全性** (TypeScriptの型システムを活用)

### 実装例

#### SendMoneyCommand.ts

```typescript
import { z } from 'zod';
import { AccountId } from '../../domain/model/Activity';
import { Money } from '../../domain/model/Money';

/**
 * 送金コマンド
 * 不変オブジェクトとして実装
 */
export class SendMoneyCommand {
  constructor(
    public readonly sourceAccountId: AccountId,  // 値オブジェクト
    public readonly targetAccountId: AccountId,  // 値オブジェクト
    public readonly money: Money                 // 値オブジェクト
  ) {
    // バリデーション
    const result = SendMoneyCommandSchema.safeParse({
      sourceAccountId,
      targetAccountId,
      money,
    });

    if (!result.success) {
      throw new Error(
        `Invalid SendMoneyCommand: ${result.error.errors.map((e) => e.message).join(', ')}`
      );
    }
  }
}
```

#### Account.ts（ドメインモデル）

```typescript
/**
 * お金を保持するアカウント
 * アグリゲートルート：ビジネスルールを強制する責任を持つ
 */
export class Account {
  private constructor(
    private readonly id: AccountId | null,
    private readonly baselineBalance: Money,
    private readonly activityWindow: ActivityWindow
  ) {}

  /**
   * 指定金額を引き出す（出金）
   * 成功した場合、新しいアクティビティを作成
   */
  withdraw(money: Money, targetAccountId: AccountId): boolean {
    if (!this.mayWithdraw(money)) {
      return false;  // ビジネスルール：残高不足は拒否
    }

    const withdrawal = Activity.withoutId(
      this.id!,
      this.id!,
      targetAccountId,
      new Date(),
      money
    );

    this.activityWindow.addActivity(withdrawal);
    return true;
  }

  /**
   * 引き出しが可能かどうかチェック
   * 残高が0以上になる場合のみ許可
   */
  private mayWithdraw(money: Money): boolean {
    return this.calculateBalance().minus(money).isPositiveOrZero();
  }
}
```

### なぜ値オブジェクトを使うのか？

1. **型安全性**
   - `AccountId` を使うことで、`string` や `number` との混同を防ぐ
   - コンパイル時に型エラーを検出できる

2. **ビジネスルールの集約**
   - `Money` クラスに「金額は正の数である」というルールを含められる
   - ドメインの制約をモデル自体に持たせることができる

3. **不変性の保証**
   - 値オブジェクトは一度作成したら変更できない
   - バグの原因となる予期しない変更を防げる

---

## 💾 永続化層のモデル（エンティティ）

### 目的

- データベースのテーブル構造を表現する
- ORMやクエリビルダーとの連携
- データベースとの入出力

### 特徴

- **DBスキーマと1対1対応**
- **プリミティブ型** (`number`, `string`)
- **スネークケース** (DBの命名規則に従う)
- **NULL許容** (DBの制約に対応)

### 実装例

#### ActivityEntity.ts

```typescript
/**
 * データベースのactivitiesテーブルを表現するエンティティ
 * Supabaseのテーブル構造と1対1で対応
 */
export interface ActivityEntity {
  id?: number;                  // 自動採番のためオプショナル
  timestamp: string;            // ISO 8601形式
  owner_account_id: number;     // スネークケース
  source_account_id: number;
  target_account_id: number;
  amount: number;
}

/**
 * データベースから取得した際の型（idが必須）
 */
export interface PersistedActivityEntity extends Required<ActivityEntity> {
  id: number;
}
```

#### AccountEntity.ts

```typescript
import { PersistedActivityEntity } from './ActivityEntity';

/**
 * データベースのaccountsテーブルを表現するエンティティ
 */
export interface AccountEntity {
  id: number;
}

/**
 * アカウントの完全な状態（アクティビティを含む）
 * 集約を表現するための構造
 */
export interface AccountAggregateEntity {
  account: AccountEntity;
  activities: PersistedActivityEntity[];
  baselineBalance: number; // 計算されたベースライン残高
}
```

### なぜドメインモデルと分けるのか？

1. **データベーススキーマの変更に強い**
   - カラム名を変更してもドメインモデルは不変
   - テーブル構造のリファクタリングがドメインに影響しない

2. **ORMの制約から解放される**
   - ドメインモデルにORMのアノテーションを付ける必要がない
   - ドメインモデルを純粋に保てる

3. **永続化の関心事の分離**
   - ドメインモデルは「ビジネスロジック」に集中
   - エンティティは「永続化」に集中

---

## 🔄 モデル間の変換ルール

### Web層のモデル ↔ ドメインモデル

**変換の方向:**
- `SendMoneyWebRequest` → `SendMoneyCommand` (リクエスト時)
- ビジネスロジック結果 → `SendMoneyWebResponse` (レスポンス時)

**変換の責務:**
- `SendMoneyMapper` クラスが担当

**変換時の注意点:**
- `string` → `BigInt` への変換（数値の精度に注意）
- プリミティブ型 → 値オブジェクト（バリデーションを含む）

### ドメインモデル ↔ 永続化層のエンティティ

**変換の方向:**
- `AccountAggregateEntity` → `Account` (読み込み時)
- `Account` → `ActivityEntity[]` (書き込み時)

**変換の責務:**
- `AccountMapper` クラスが担当
- Supabaseの生データ→PersistedActivityEntityの変換もMapperが担当

**変換時の注意点:**
- Supabaseの生データを`toPersistedActivityEntity()`でエンティティに変換
- `number` → `BigInt` への変換
- スネークケース → キャメルケースの変換
- 集約の再構成（ベースライン残高の計算）

---

## 📊 プリミティブ型 vs 値オブジェクト

### プリミティブ型の使用場面

- **Web層**: JSONシリアライズが必要
- **永続化層**: DBとの入出力

### 値オブジェクトの使用場面

- **ドメイン層**: ビジネスルールの強制が必要

### 比較表

| 観点 | プリミティブ型 | 値オブジェクト |
|------|---------------|---------------|
| **型安全性** | ❌ 低い | ✅ 高い |
| **ビジネスルール** | ❌ 含められない | ✅ 含められる |
| **JSONシリアライズ** | ✅ 容易 | ❌ 困難（カスタム実装が必要） |
| **DBとの互換性** | ✅ 高い | ❌ 低い |
| **コード量** | ✅ 少ない | ❌ 多い |
| **保守性** | ❌ 低い | ✅ 高い |

---

## 🎯 まとめ

### 各層のモデルの役割

| 層 | モデル | 目的 | 特徴 |
|----|--------|------|------|
| **Web層** | `SendMoneyWebRequest/Response` | HTTPとの入出力 | プリミティブ型、JSONシリアライズ可能 |
| **アプリケーション層** | `Account`, `Activity`, `Money` | ビジネスロジック | 値オブジェクト、不変性、ビジネスルール |
| **永続化層** | `AccountEntity`, `ActivityEntity` | DBとの入出力 | DBスキーマと1対1対応、スネークケース |

### 各層の責務の分離

- **Web層**: HTTPプロトコルの詳細を隠蔽
- **アプリケーション層**: ビジネスルールを強制
- **永続化層**: データベースの詳細を隠蔽

この責務の分離により、各層が独立して変更可能になり、長期的な保守性が向上します。

---

## 🔗 関連ドキュメント

- [01-mapping-strategy.md](./01-mapping-strategy.md) - 双方向モデル変換の概要
- [03-mappers-guide.md](./03-mappers-guide.md) - マッパーの実装ガイド
- [../diagrams/layer-architecture.md](../diagrams/layer-architecture.md) - レイヤーアーキテクチャの全体図
