# モデル変換戦略の比較

## 📖 概要

このドキュメントでは、Tom Hombergs著「Get Your Hands Dirty on Clean Architecture」第9章で紹介されている3つのモデル変換戦略を比較し、いつどの戦略を使うべきかを説明します。

---

## 🎯 3つの戦略

### 1. モデルを変換しない戦略 (No Mapping Strategy)

すべての層で同じドメインモデルを使用する戦略。

```
┌─────────────┐
│   Web層     │ ←┐
├─────────────┤  │
│アプリケーション│  │ すべて同じ
│     層      │  │ ドメインモデル
├─────────────┤  │ を使用
│  永続化層   │ ←┘
└─────────────┘
```

### 2. 一方向でのモデルの変換 (One-Way Mapping)

特定の方向（例：ドメイン → Web）のみ変換する戦略。

```
┌─────────────┐
│   Web層     │ ← [変換] ← ドメインモデル
├─────────────┤
│アプリケーション│ → ドメインモデル
│     層      │
├─────────────┤
│  永続化層   │ ← ドメインモデルをそのまま使用
└─────────────┘
```

### 3. 双方向でのモデルの変換 (Two-Way Mapping) ⭐

すべての層が独自のモデルを持ち、境界で双方向に変換する戦略。

```
┌─────────────┐
│   Web層     │ ←[変換]→ Web層モデル
├─────────────┤
│アプリケーション│ ←[変換]→ ドメインモデル
│     層      │
├─────────────┤
│  永続化層   │ ←[変換]→ 永続化層モデル
└─────────────┘
```

---

## 📊 比較表

| 観点 | モデルを変換しない | 一方向での変換 | **双方向での変換** |
|------|------------------|---------------|-------------------|
| **コード量** | ★★★ 少ない | ★★☆ 中程度 | ★☆☆ 多い |
| **シンプルさ** | ★★★ シンプル | ★★☆ 中程度 | ★☆☆ 複雑 |
| **結合度** | ★☆☆ 高い | ★★☆ 中程度 | ★★★ 低い |
| **柔軟性** | ★☆☆ 低い | ★★☆ 中程度 | ★★★ 高い |
| **保守性** | ★☆☆ 低い | ★★☆ 中程度 | ★★★ 高い |
| **ドメインの純粋性** | ★☆☆ 低い | ★★☆ 中程度 | ★★★ 高い |

---

## 🔍 各戦略の詳細

### 1. モデルを変換しない戦略

#### 概要

すべての層で同じドメインモデル（例：`Account`）を使用します。

#### メリット

✅ **シンプル**
- コードが少なく、理解しやすい
- マッパークラスが不要

✅ **開発速度が速い**
- プロトタイプやMVPの開発に適している
- 小規模なプロジェクトで有効

#### デメリット

❌ **層間の結合度が高い**
- Web APIの形式を変えると、ドメインモデルに影響
- データベーススキーマを変えると、ドメインモデルに影響

❌ **ドメインモデルが汚染される**
- Web用のアノテーション（例：JSONシリアライズ）
- DB用のアノテーション（例：ORM）
- これらがドメインモデルに混入する

❌ **柔軟性が低い**
- APIのバージョニングが困難
- データベースのリファクタリングが困難

#### 適用場面

- 小規模プロジェクト（数週間で完成）
- プロトタイプ・MVP
- 単純なCRUD操作のみ
- 変更がほとんど発生しないシステム

#### コード例

```typescript
// すべての層で同じAccountクラスを使用
class Account {
  @JsonProperty('id')        // Web層のアノテーション
  @Column('account_id')      // DB層のアノテーション
  id: AccountId;
  
  @JsonProperty('balance')
  @Column('balance')
  balance: Money;
}

// Web層
app.post('/accounts', (req, res) => {
  const account = new Account(req.body); // Accountを直接使用
  repository.save(account);
  res.json(account);
});

// 永続化層
class AccountRepository {
  save(account: Account) {
    // Accountをそのまま保存
  }
}
```

---

### 2. 一方向でのモデルの変換

#### 概要

アプリケーションの核は各アダプタが独自のモデルを持つようにするが、送信ポートから戻ってくるときは、受信ポートに送られてきたドメインモデルを変換しなければならないときだけモデルを使う。

例：ドメインモデルからWeb層のモデルに変換するが、Web層からドメイン層への変換は行わない（ドメインモデルをそのまま使う）。

#### メリット

✅ **バランスが取れている**
- 完全な疎結合ほど複雑ではない
- ある程度の柔軟性を確保

✅ **特定の層を保護できる**
- 例：Web層のモデルを変更してもドメインに影響しない
- 例：ドメインモデルはWeb層のアノテーションから解放される

#### デメリット

❌ **一部の層で結合が残る**
- 例：ドメインモデルを受信ポートで直接受け取る場合、Web層とドメイン層が結合

❌ **中途半端になりがち**
- どこで変換するか・しないかの判断が難しい
- チーム内で一貫性を保つのが困難

#### 適用場面

- 中規模プロジェクト
- 特定の層（例：Web層）のみ頻繁に変更される
- ドメインモデルは安定しているが、APIは変更が多い

#### コード例

```typescript
// ドメイン層：変換なし
class Account {
  id: AccountId;
  balance: Money;
}

// Web層：ドメインモデルからWebモデルに変換
class AccountWebResponse {
  id: string;
  balance: string;
}

class AccountMapper {
  // ドメイン → Web への変換のみ
  static toWebResponse(account: Account): AccountWebResponse {
    return {
      id: account.id.toString(),
      balance: account.balance.toString(),
    };
  }
}

// Web層
app.post('/accounts', (req, res) => {
  // Web → ドメイン の変換はなし（ドメインモデルを直接使用）
  const command = new SendMoneyCommand(
    new AccountId(req.body.sourceAccountId),
    new AccountId(req.body.targetAccountId),
    Money.of(req.body.amount)
  );
  
  const account = sendMoneyUseCase.execute(command);
  
  // ドメイン → Web の変換あり
  res.json(AccountMapper.toWebResponse(account));
});
```

---

### 3. 双方向でのモデルの変換 ⭐（このプロジェクトで採用）

#### 概要

すべての層が独自のモデルを持ち、層の境界でマッパーを使って双方向に変換します。

#### メリット

✅ **完全な疎結合**
- 各層が独立して変更可能
- Web APIの形式を変更してもドメインモデルに影響しない
- データベーススキーマを変更してもドメインモデルに影響しない

✅ **ドメインモデルの純粋性**
- ドメインモデルにWeb用のアノテーションが不要
- ドメインモデルにDB用のアノテーションが不要
- ドメインモデルはビジネスロジックのみに集中できる

✅ **柔軟性**
- APIのバージョニングが容易（新しいWebモデルを追加）
- データベースのマイグレーションが容易（新しいエンティティを追加）
- 複数のAPIバージョンを同時にサポート可能

✅ **保守性**
- 変更の影響範囲が明確
- コードレビューが容易
- バグの原因特定が容易

✅ **テスト容易性**
- 各層を独立してテスト可能
- モックの作成が容易

#### デメリット

❌ **コード量が多い**
- 各層ごとにモデルを定義
- マッパークラスを実装
- 同じような構造のクラスが複数存在

❌ **初期開発速度が低い**
- セットアップに時間がかかる
- 新しいメンバーの学習コストが高い

❌ **小規模プロジェクトではオーバーエンジニアリング**
- プロトタイプには不向き
- シンプルなCRUDアプリには過剰

#### 適用場面

- **大規模プロジェクト**（数ヶ月〜数年の開発期間）
- **長期保守が必要なシステム**
- **頻繁に変更されるシステム**
- **複雑なビジネスロジックを持つシステム**
- **APIのバージョニングが必要なシステム**
- **チーム開発**（複数の開発者が並行して作業）

#### コード例

```typescript
// Web層のモデル
interface SendMoneyWebRequest {
  sourceAccountId: string;
  targetAccountId: string;
  amount: string;
}

interface SendMoneyWebResponse {
  success: boolean;
  message: string;
}

// ドメインモデル
class Account {
  id: AccountId;
  balance: Money;
}

class SendMoneyCommand {
  sourceAccountId: AccountId;
  targetAccountId: AccountId;
  money: Money;
}

// 永続化層のレコード
interface PersistedAccountRecord {
  id: number;
}

interface ActivityRecord {
  owner_account_id: number;
  amount: number;
}

interface PersistedActivityRecord {
  id: number;
  owner_account_id: number;
  amount: number;
}

// Web層のマッパー
class SendMoneyMapper {
  static toCommand(request: SendMoneyWebRequest): SendMoneyCommand {
    return new SendMoneyCommand(
      new AccountId(BigInt(request.sourceAccountId)),
      new AccountId(BigInt(request.targetAccountId)),
      Money.of(BigInt(request.amount))
    );
  }

  static toResponse(success: boolean): SendMoneyWebResponse {
    return { success, message: '...' };
  }
}

// 永続化層のマッパー
// 注意: PersistedActivityRecordはSupabaseの型定義から直接派生するため、
// Supabaseの生データを変換するメソッドは不要
class AccountMapper {
  static toDomain(aggregate: AccountAggregateRecord): Account {
    // レコード → ドメインモデル
  }

  static toRecords(account: Account): ActivityRecord[] {
    // ドメインモデル → レコード
  }
}
```

---

## 🎯 いつどの戦略を使うべきか？

### 決定フローチャート

```
プロジェクトの規模は？
├─ 小規模（〜数週間）
│  └→ 【モデルを変換しない戦略】
│
├─ 中規模（数ヶ月）
│  │
│  ├─ 特定の層（Web/DB）のみ頻繁に変更？
│  │  └→ 【一方向でのモデルの変換】
│  │
│  └─ 複雑なビジネスロジック？
│     └→ 【双方向でのモデルの変換】
│
└─ 大規模（数年）
   └→ 【双方向でのモデルの変換】
```

### 本からの引用

書籍「Get Your Hands Dirty on Clean Architecture」第9.5節では、以下のように述べられています：

> **「アプリケーションの状態を変更するユースケース」を扱う場合、「Webアダプタと永続化アダプタ」とのあいだで行なうモデルの変換に関する戦略と「アプリケーション層と永続化アダプタ」とのモデルの変換に関する戦略は両方とも「モデルを変換しない戦略」を第一の選択候補とする。**

> **ただし、単純なCRUD操作しか行なわないユースケースがWebアダプタや永続化アダプタだけでしか扱われないことになり、ドメインモデルに付けられているアノテーションや0/Rマッパーが利用するアノテーションについてはどうなのでしょうか？ そこで考えるのが、「徹底的なモデルの変換」を採用する戦略である。**

### 具体的な判断基準

#### モデルを変換しない戦略を選ぶべき場合

- ✅ プロトタイプやMVP
- ✅ 小規模プロジェクト（数週間で完成）
- ✅ 単純なCRUD操作のみ
- ✅ 変更がほとんど発生しない
- ✅ チームが小さい（1〜2人）

#### 一方向でのモデルの変換を選ぶべき場合

- ✅ 中規模プロジェクト（数ヶ月）
- ✅ Web APIは頻繁に変更されるが、ドメインモデルは安定している
- ✅ または、データベーススキーマは頻繁に変更されるが、ドメインモデルは安定している
- ✅ 完全な疎結合は不要だが、ある程度の柔軟性は欲しい

#### 双方向でのモデルの変換を選ぶべき場合

- ✅ 大規模プロジェクト（数ヶ月〜数年）
- ✅ 長期保守が必要
- ✅ 複雑なビジネスロジック
- ✅ APIのバージョニングが必要
- ✅ 頻繁な変更が予想される
- ✅ チームが大きい（3人以上）
- ✅ 複数のアダプタ（Web、モバイル、CLI等）が必要

---

## 📝 このプロジェクトでの選択

### なぜ「双方向でのモデルの変換」を採用したか

このプロジェクト（Buckpal）では、以下の理由から**双方向でのモデルの変換**を採用しました：

1. **学習目的**
   - ヘキサゴナルアーキテクチャの理解を深めるため
   - 本（Get Your Hands Dirty on Clean Architecture）の推奨する方法を実践するため

2. **長期保守を想定**
   - サンプルプロジェクトとして、長期的に参照される可能性がある
   - アーキテクチャのベストプラクティスを示すため

3. **複雑なビジネスロジック**
   - 単純なCRUDではなく、送金という複雑な操作を扱う
   - ビジネスルール（残高チェック、閾値チェック等）が存在する

4. **拡張性の確保**
   - 将来的に新しい機能（例：複数通貨対応、手数料計算等）を追加する可能性
   - Web APIのバージョニングに対応する必要があるかもしれない

---

## 🔄 戦略の移行

### モデルを変換しない → 双方向での変換

プロジェクトが成長する過程で、戦略を移行することも可能です。

#### 移行の手順

1. **Web層のモデルを作成**
   - `SendMoneyWebRequest`, `SendMoneyWebResponse` を追加

2. **Web層のマッパーを作成**
   - `SendMoneyMapper` を実装

3. **コントローラーを修正**
   - ドメインモデルを直接使う代わりに、マッパーを使用

4. **永続化層のエンティティを作成**
   - `AccountEntity`, `ActivityEntity` を追加

5. **永続化層のマッパーを作成**
   - `AccountMapper` を実装

6. **リポジトリを修正**
   - ドメインモデルを直接使う代わりに、マッパーを使用

#### 移行時の注意点

- 既存のテストが壊れる可能性があるため、段階的に移行する
- まずWeb層から始め、次に永続化層を移行
- マッパーのユニットテストを書いてから移行する

---

## 🔗 関連ドキュメント

- [01-mapping-strategy.md](./01-mapping-strategy.md) - 双方向モデル変換の概要
- [02-layer-models.md](./02-layer-models.md) - 各層のモデルの詳細
- [03-mappers-guide.md](./03-mappers-guide.md) - マッパーの実装ガイド

---

## 📚 参考文献

- Tom Hombergs著「Get Your Hands Dirty on Clean Architecture」第9章
  - 9.1 モデルを変換しない戦略
  - 9.2 双方向でのモデルの変換
  - 9.3 徹底的なモデルの変換
  - 9.4 一方向でのモデルの変換
  - 9.5 モデルの変換に関して、どの戦略をいつ使うべきなのか？
