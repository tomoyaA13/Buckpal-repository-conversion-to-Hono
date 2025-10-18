# 双方向でのモデルの変換

## 📖 概要

このプロジェクトでは、ヘキサゴナルアーキテクチャにおいて**「双方向でのモデルの変換」**戦略を採用しています。

この戦略は、Tom Hombergs著「Get Your Hands Dirty on Clean Architecture」の第9章で推奨されている方法で、アプリケーションの各層（Web層、アプリケーション層、永続化層）がそれぞれ独自のモデルを持ち、層の境界でマッパーを使って相互に変換する手法です。

## 🎯 なぜこの戦略を採用したのか

### 本からの引用（第9章）

書籍では、モデルの変換に関して以下の3つの戦略が紹介されています：

1. **モデルを変換しない戦略**
   - すべての層で同じドメインモデルを使用
   - シンプルだが、層間の結合度が高い

2. **一方向でのモデルの変換**
   - 特定の方向（例：ドメイン → Web）のみ変換
   - バランスは取れているが、一部の層で結合が残る

3. **双方向でのモデルの変換** ⭐ **採用した戦略**
   - すべての層が独自のモデルを持ち、境界で双方向に変換
   - 最も疎結合で柔軟性が高い

### この戦略を選んだ理由

本書では、以下のように述べられています：

> **「アプリケーションの状態を変更するユースケース」を扱う場合、「Webアダプタと永続化アダプタ」とのあいだで行なうモデルの変換に関する戦略と「アプリケーション層と永続化アダプタ」とのモデルの変換に関する戦略は両方とも「モデルを変換しない戦略」を第一の選択候補とする。**

> **ただし、単純なCRUD操作しか行なわないユースケースがWebアダプタや永続化アダプタだけでしか扱われないことになり、ドメインモデルに付けられているアノテーションや0/Rマッパーが利用するアノテーションについてはどうなのでしょうか？ そこで考えるのが、「徹底的なモデルの変換」を採用する戦略である。**

私たちのプロジェクトでは以下の理由から、双方向でのモデルの変換を採用しました：

1. **単純なCRUD操作だけではない複雑なビジネスロジックを扱う**
2. **Web APIの形式変更がドメインモデルに影響を与えないようにする**
3. **データベーススキーマの変更がドメインモデルに影響を与えないようにする**
4. **長期的な保守性と拡張性を重視する**

## 🏗️ アーキテクチャ

### 各層のモデル

```
┌─────────────────────────────────────────────────────────────┐
│                        Web層                                 │
│  SendMoneyWebRequest (プリミティブ型)                         │
│  SendMoneyWebResponse (プリミティブ型)                        │
└────────────────────┬────────────────────────────────────────┘
                     │ SendMoneyMapper
                     ↓ toCommand() / toSuccessResponse()
┌─────────────────────────────────────────────────────────────┐
│                   アプリケーション層                          │
│  SendMoneyCommand (値オブジェクト)                            │
│  Account, Activity, Money (ドメインモデル)                    │
└────────────────────┬────────────────────────────────────────┘
                     │ AccountMapper
                     ↓ toDomain() / toActivityEntities()
┌─────────────────────────────────────────────────────────────┐
│                     永続化層                                  │
│  AccountEntity, ActivityEntity (DBテーブル構造)               │
└─────────────────────────────────────────────────────────────┘
```

詳細は [02-layer-models.md](./02-layer-models.md) を参照してください。

## 🔄 変換フロー

### リクエスト → レスポンスの流れ

```
HTTPリクエスト
  ↓
【Web層】SendMoneyWebRequest (プリミティブ型)
  ↓ [SendMoneyMapper.toCommand()]
【アプリケーション層】SendMoneyCommand (ドメインモデル)
  ↓
【ビジネスロジック実行】
  ↓
【アプリケーション層】Account (ドメインモデル)
  ↓ [AccountMapper.toActivityEntities()]
【永続化層】ActivityEntity[] (DBエンティティ)
  ↓
Supabase INSERT
  ↓
【Web層】SendMoneyWebResponse (プリミティブ型)
  ↓
HTTPレスポンス
```

Mermaidシーケンス図については [../diagrams/mapping-flow.md](../diagrams/mapping-flow.md) を参照してください。

## 💻 実装例

### Web層のマッパー

```typescript
// src/adapter/in/web/mappers/SendMoneyMapper.ts

export class SendMoneyMapper {
  // Web層のモデル → ドメインモデル
  static toCommand(request: SendMoneyWebRequest): SendMoneyCommand {
    const sourceAccountId = new AccountId(BigInt(request.sourceAccountId));
    const targetAccountId = new AccountId(BigInt(request.targetAccountId));
    const money = Money.of(BigInt(request.amount));
    return new SendMoneyCommand(sourceAccountId, targetAccountId, money);
  }

  // ビジネスロジック結果 → Web層のモデル
  static toSuccessResponse(request: SendMoneyWebRequest): SendMoneyWebResponse {
    return {
      success: true,
      message: 'Money transfer completed successfully',
      data: {
        sourceAccountId: request.sourceAccountId,
        targetAccountId: request.targetAccountId,
        amount: request.amount,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
```

### 永続化層のマッパー

```typescript
// src/adapter/out/persistence/mappers/AccountMapper.ts

export class AccountMapper {
  // DBエンティティ → ドメインモデル
  // 注意: PersistedActivityEntityはSupabaseの型定義から直接派生するため、
  // Supabaseの生データを変換するメソッドは不要
  static toDomain(aggregate: AccountAggregateEntity): Account {
    const accountId = new AccountId(BigInt(aggregate.account.id));
    const baselineBalance = Money.of(BigInt(aggregate.baselineBalance));
    const activities = aggregate.activities.map((e) => this.activityToDomain(e));
    const activityWindow = new ActivityWindow(...activities);
    return Account.withId(accountId, baselineBalance, activityWindow);
  }

  // ドメインモデル → DBエンティティ
  static toActivityEntities(account: Account): ActivityEntity[] {
    const newActivities = account
      .getActivityWindow()
      .getActivities()
      .filter((activity) => !activity.getId());
    return newActivities.map((activity) => this.activityToEntity(activity));
  }
}
```

## ✅ メリット

### 1. 疎結合
- 各層が独自のモデルを持ち、他の層への依存を最小化
- Web APIの形式を変更してもドメインモデルに影響しない
- データベーススキーマを変更してもドメインモデルに影響しない

### 2. 柔軟性
- JSONのフィールド名を変更しても、ドメインモデルは不変
- 新しいWeb APIバージョンを追加しても、既存のドメインロジックを変更不要
- データベースのマイグレーションがドメインに影響しない

### 3. 保守性
- 各層の責務が明確になり、変更の影響範囲が限定される
- コードレビューが容易（どの層の変更かが明確）
- バグの原因特定が容易（層ごとに切り分けられる）

### 4. テスト容易性
- 各マッパーを独立してユニットテストできる
- モックの作成が容易（各層のモデルが独立している）
- ドメインロジックのテストに外部の関心事（WebやDB）が混入しない

### 5. チーム開発
- Web APIの担当者とドメインロジックの担当者が独立して作業できる
- マッパーが明確な契約（インターフェース）となる
- コードの責任範囲が明確で、レビューしやすい

## ⚠️ デメリット

### 1. コード量の増加
- 各層ごとにモデルを定義する必要がある
- マッパークラスを実装する必要がある
- 同じような構造のクラスが複数存在する

### 2. 学習コスト
- 新しいメンバーがアーキテクチャを理解するのに時間がかかる
- どの層でどのモデルを使うべきか、最初は混乱する可能性がある

### 3. 変換のオーバーヘッド
- オブジェクトの変換処理が実行時に発生する
- ただし、このオーバーヘッドはほとんどの場合無視できる程度

### 4. 初期開発速度の低下
- プロトタイプや小規模なプロジェクトでは、オーバーエンジニアリングに感じる可能性がある

## ⚖️ 他の戦略との比較

詳細な比較は [04-strategy-comparison.md](./04-strategy-comparison.md) を参照してください。

| 戦略 | コード量 | 結合度 | 柔軟性 | 適用場面 |
|------|---------|--------|--------|---------|
| モデルを変換しない | ★★★ 少ない | ★☆☆ 高い | ★☆☆ 低い | 小規模、変更が少ない |
| 一方向での変換 | ★★☆ 中程度 | ★★☆ 中程度 | ★★☆ 中程度 | 中規模、特定層のみ保護 |
| **双方向での変換** | ★☆☆ 多い | ★★★ 低い | ★★★ 高い | **大規模、長期保守** |

## 📝 ベストプラクティス

### マッパーの実装時の注意点

1. **マッパーはステートレスにする**
   - すべてのメソッドを `static` にする
   - インスタンス変数を持たない
   
   **理由：**
   - **純粋関数**: 同じ入力に対して常に同じ出力を返し、副作用がない
   - **並行処理で安全**: 複数のリクエストが同時に来ても競合が発生しない
   - **テストが簡単**: 各テストが独立しており、前のテストの影響を受けない
   - **インスタンス化不要**: メモリ効率が良く、DIコンテナへの登録も不要
   - **意図が明確**: 「変換ユーティリティ」であることが一目瞭然
   
   ```typescript
   // ✅ GOOD: ステートレス
   export class SendMoneyMapper {
     static toCommand(request: SendMoneyWebRequest): SendMoneyCommand {
       // 引数のみから結果を生成（外部の状態に依存しない）
       return new SendMoneyCommand(/* ... */);
     }
   }
   
   // 使い方：インスタンス化不要
   const command = SendMoneyMapper.toCommand(request);
   
   // ❌ BAD: ステートフル
   export class BadMapper {
     private lastTimestamp: Date;  // 状態を持つ
     
     toCommand(request: SendMoneyWebRequest): SendMoneyCommand {
       this.lastTimestamp = new Date();  // 副作用あり
       // 前回の変換の影響を受ける可能性がある
     }
   }
   ```

2. **変換ロジックにビジネスロジックを含めない**
   - マッパーは純粋に「変換」のみを行う
   - バリデーションや計算はドメイン層で行う

3. **エラーハンドリングを適切に行う**
   - 変換に失敗した場合は、わかりやすいエラーメッセージを返す
   - 必要に応じてカスタム例外を定義する

4. **一貫性のある命名規則**
   - `toCommand()`: Web層のモデル → ドメインモデル
   - `toResponse()`: ビジネスロジック結果 → Web層のモデル
   - `toDomain()`: DBエンティティ → ドメインモデル
   - `toEntity()` / `toEntities()`: ドメインモデル → DBエンティティ

5. **マッパーは双方向に変換できるようにする**
   - `A → B` と `B → A` の両方のメソッドを提供
   - ただし、完全に可逆的である必要はない（情報の損失は許容される）
   
   **「双方向」の意味：**
   - 両方向の変換メソッドを提供すること（例：`toDomain()` と `toEntities()`）
   
   **「完全に可逆的である必要はない」の意味：**
   - `A → B → A'` となり、元のAと異なるA'になってもOK
   - 各層が必要な情報だけを持つべきであり、全ての情報を保持する必要はない
   
   ```typescript
   // 例：Web層の詳細情報はドメインモデルに含まれない
   const webRequest = {
     sourceAccountId: '1',
     targetAccountId: '2',
     amount: '1000',
     clientTimestamp: '2025-10-17T10:00:00Z',  // Web層の関心事
     userAgent: 'Mozilla/5.0...'                // Web層の関心事
   };
   
   // Web → ドメイン（clientTimestamp, userAgentは失われる）
   const command = SendMoneyMapper.toCommand(webRequest);
   // command には sourceAccountId, targetAccountId, money のみ
   
   // ドメイン → Web（サーバー側で新しいタイムスタンプが生成される）
   const response = SendMoneyMapper.toSuccessResponse(webRequest);
   // response.data.timestamp は元の clientTimestamp とは異なる
   ```
   
   **なぜ情報の損失が許容されるのか：**
   - **ドメインモデルはビジネスロジックに集中すべき**（Web層やDB層の詳細は不要）
   - **計算値は保存しない**（次回読み込み時に再計算すればよい）
   - **DBの自動生成値**（id、created_at等）はドメインモデルに含める必要がない

詳細は [03-mappers-guide.md](./03-mappers-guide.md) を参照してください。

## 🔗 関連ドキュメント

- [02-layer-models.md](./02-layer-models.md) - 各層のモデルの詳細説明
- [03-mappers-guide.md](./03-mappers-guide.md) - マッパーの実装ガイド
- [04-strategy-comparison.md](./04-strategy-comparison.md) - 3つの戦略の比較
- [../diagrams/mapping-flow.md](../diagrams/mapping-flow.md) - 変換フローの図解
- [../diagrams/layer-architecture.md](../diagrams/layer-architecture.md) - レイヤーアーキテクチャの全体図

## 📚 参考文献

- Tom Hombergs著「Get Your Hands Dirty on Clean Architecture」第9章
  - 9.1 モデルを変換しない戦略
  - 9.2 双方向でのモデルの変換
  - 9.3 徹底的なモデルの変換
  - 9.4 一方向でのモデルの変換
  - 9.5 モデルの変換に関して、どの戦略をいつ使うべきなのか？
