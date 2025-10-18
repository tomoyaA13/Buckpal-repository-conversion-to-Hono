# 双方向モデル変換のフロー図

## 📖 概要

このドキュメントでは、Mermaidシーケンス図を使って、双方向でのモデルの変換の流れを視覚的に説明します。

---

## 🔄 送金処理の全体フロー

以下の図は、HTTPリクエストからレスポンスまでの送金処理の全体的な流れを示しています。

```mermaid
sequenceDiagram
    participant Client as クライアント
    participant Controller as SendMoneyController<br/>(Web層)
    participant Mapper1 as SendMoneyMapper
    participant UseCase as SendMoneyUseCase<br/>(アプリケーション層)
    participant Account as Account<br/>(ドメインモデル)
    participant Adapter as SupabaseAccountPersistenceAdapter<br/>(永続化層)
    participant Mapper2 as AccountMapper
    participant DB as Supabase DB
    
    Note over Client,DB: ✅ 推奨パターン: 双方向でのモデルの変換

    Client->>Controller: POST /accounts/send<br/>Body: SendMoneyWebRequest<br/>{sourceAccountId: "1", targetAccountId: "2", amount: "1000"}
    
    rect rgb(255, 240, 200)
    Note over Controller: ① バリデーション<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>Web層でリクエストデータの<br/>形式をチェックする<br/>━━━━━━━━━━━━━━━━━━<br/>不正な形式のデータを<br/>早期に拒否し、<br/>後続の処理を保護する
    end
    
    Controller->>Mapper1: toCommand(webRequest)
    
    rect rgb(200, 240, 255)
    Note over Mapper1: ② Web層 → ドメイン層の変換<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>プリミティブ型を<br/>値オブジェクトに変換する<br/>━━━━━━━━━━━━━━━━━━<br/>・string → AccountId<br/>・string → Money<br/>ドメイン層が型安全に<br/>ビジネスロジックを実行できる
    end
    
    Mapper1-->>Controller: SendMoneyCommand<br/>(値オブジェクト)
    
    Controller->>UseCase: sendMoney(command)
    
    rect rgb(255, 220, 255)
    Note over UseCase: ③ ビジネスロジック実行<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>送金のビジネスルールを<br/>適用する<br/>━━━━━━━━━━━━━━━━━━<br/>・残高チェック<br/>・送金額の閾値チェック<br/>・取引の記録
    end
    
    UseCase->>Adapter: loadAccount(sourceAccountId)
    
    rect rgb(200, 255, 200)
    Note over Adapter: ④ DBからアカウントを読み込み<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>永続化されているデータを<br/>取得する<br/>━━━━━━━━━━━━━━━━━━<br/>アカウント情報と<br/>過去の取引履歴を取得
    end
    
    Adapter->>DB: SELECT * FROM accounts WHERE id = 1
    DB-->>Adapter: AccountEntity (DBレコード)
    
    Adapter->>DB: SELECT * FROM activities WHERE owner_account_id = 1
    DB-->>Adapter: ActivityEntity[] (DBレコード)
    
    Adapter->>Mapper2: toDomain(aggregate)
    
    rect rgb(200, 240, 255)
    Note over Mapper2: ⑤ 永続化層 → ドメイン層の変換<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>DBエンティティを<br/>ドメインモデルに変換する<br/>━━━━━━━━━━━━━━━━━━<br/>・number → AccountId<br/>・number → Money<br/>・集約の再構成<br/>ドメインモデルとして<br/>ビジネスロジックを実行できる
    end
    
    Mapper2-->>Adapter: Account (ドメインモデル)
    Adapter-->>UseCase: Account
    
    rect rgb(255, 220, 255)
    Note over UseCase,Account: ⑥ 送金処理の実行<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>ドメインモデルのメソッドを<br/>呼び出してビジネスロジックを<br/>実行する<br/>━━━━━━━━━━━━━━━━━━<br/>Account.withdraw():<br/>- 残高チェック<br/>- アクティビティの追加
    end
    
    UseCase->>Account: withdraw(money, targetAccountId)
    Account-->>UseCase: true (成功)
    
    UseCase->>Adapter: loadAccount(targetAccountId)
    Adapter->>DB: SELECT...
    DB-->>Adapter: AccountEntity
    Adapter->>Mapper2: toDomain(aggregate)
    Mapper2-->>Adapter: Account
    Adapter-->>UseCase: Account
    
    UseCase->>Account: deposit(money, sourceAccountId)
    Account-->>UseCase: true (成功)
    
    rect rgb(200, 255, 200)
    Note over UseCase: ⑦ アカウントの状態を永続化<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>メモリ上の変更を<br/>DBに保存する<br/>━━━━━━━━━━━━━━━━━━<br/>新しく追加された<br/>アクティビティをDBに記録
    end
    
    UseCase->>Adapter: updateActivities(sourceAccount)
    
    Adapter->>Mapper2: toActivityEntities(account)
    
    rect rgb(200, 240, 255)
    Note over Mapper2: ⑧ ドメイン層 → 永続化層の変換<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>ドメインモデルを<br/>DBエンティティに変換する<br/>━━━━━━━━━━━━━━━━━━<br/>・AccountId → number<br/>・Money → number<br/>・新規アクティビティのみ抽出<br/>DBに保存できる形式に変換
    end
    
    Mapper2-->>Adapter: ActivityEntity[]
    
    Adapter->>DB: INSERT INTO activities ...
    DB-->>Adapter: 成功
    
    UseCase->>Adapter: updateActivities(targetAccount)
    Adapter->>Mapper2: toActivityEntities(account)
    Mapper2-->>Adapter: ActivityEntity[]
    Adapter->>DB: INSERT INTO activities ...
    DB-->>Adapter: 成功
    
    UseCase-->>Controller: true (成功)
    
    Controller->>Mapper1: toSuccessResponse(webRequest)
    
    rect rgb(200, 240, 255)
    Note over Mapper1: ⑨ ドメイン層 → Web層の変換<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>ビジネスロジックの結果を<br/>HTTPレスポンスに変換する<br/>━━━━━━━━━━━━━━━━━━<br/>・値オブジェクト → string<br/>・構造化されたJSONレスポンス<br/>クライアントが理解できる<br/>形式でレスポンスを返す
    end
    
    Mapper1-->>Controller: SendMoneyWebResponse<br/>(プリミティブ型)
    
    Controller-->>Client: HTTP 200 OK<br/>Body: {success: true, message: "...", data: {...}}
    
    rect rgb(255, 255, 255)
    Note over Client,DB: 📊 全体の流れの目的<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>🎯 各層の独立性を保つ:<br/>① Web層: HTTPプロトコルの詳細を隠蔽<br/>② アプリケーション層: ビジネスロジックに集中<br/>③ 永続化層: データベースの詳細を隠蔽<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>🎯 変更の影響を局所化:<br/>・Web APIの形式を変更しても<br/>  ドメインモデルは不変<br/>・DBスキーマを変更しても<br/>  ドメインモデルは不変<br/>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━<br/>🎯 型安全性の確保:<br/>各層が適切な型を使用することで<br/>コンパイル時にエラーを検出
    end
```

---

## 🔄 Web層でのモデル変換（詳細）

Web層でのリクエスト/レスポンスの変換を詳細に示します。

```mermaid
sequenceDiagram
    participant Client as クライアント
    participant Controller as SendMoneyController
    participant Validator as Zod Validator
    participant Mapper as SendMoneyMapper
    participant UseCase as SendMoneyUseCase
    
    Note over Client,UseCase: Web層でのモデル変換の詳細
    
    Client->>Controller: POST /accounts/send<br/>{sourceAccountId: "1", targetAccountId: "2", amount: "1000"}
    
    rect rgb(255, 240, 200)
    Note over Controller,Validator: ① JSONパース & バリデーション<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>HTTPリクエストを<br/>Web層のモデルに変換する<br/>━━━━━━━━━━━━━━━━━━<br/>不正な形式のデータを<br/>早期に拒否
    end
    
    Controller->>Validator: validate(body)
    Validator-->>Controller: SendMoneyWebRequest<br/>(型安全なオブジェクト)
    
    rect rgb(200, 240, 255)
    Note over Controller,Mapper: ② マッパーでドメインモデルに変換<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>Web層のモデルを<br/>ドメイン層のモデルに変換<br/>━━━━━━━━━━━━━━━━━━<br/>・string → BigInt → AccountId<br/>・string → BigInt → Money<br/>値オブジェクトにすることで<br/>型安全性とビジネスルールを確保
    end
    
    Controller->>Mapper: toCommand(webRequest)
    
    Note over Mapper: 変換処理:<br/>new AccountId(BigInt("1"))<br/>new AccountId(BigInt("2"))<br/>Money.of(BigInt("1000"))
    
    Mapper-->>Controller: SendMoneyCommand<br/>{sourceAccountId: AccountId(1),<br/> targetAccountId: AccountId(2),<br/> money: Money(1000)}
    
    Controller->>UseCase: sendMoney(command)
    UseCase-->>Controller: true
    
    rect rgb(200, 240, 255)
    Note over Controller,Mapper: ③ マッパーでWebレスポンスに変換<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>ビジネスロジックの結果を<br/>HTTPレスポンスに変換<br/>━━━━━━━━━━━━━━━━━━<br/>クライアントが理解できる<br/>JSON形式に変換
    end
    
    Controller->>Mapper: toSuccessResponse(webRequest)
    
    Mapper-->>Controller: SendMoneyWebResponse<br/>{success: true,<br/> message: "...",<br/> data: {sourceAccountId: "1", ...}}
    
    Controller-->>Client: HTTP 200 OK<br/>Content-Type: application/json<br/>Body: {...}
```

---

## 🔄 永続化層でのモデル変換（詳細）

永続化層でのDBとドメインモデルの変換を詳細に示します。

```mermaid
sequenceDiagram
    participant UseCase as SendMoneyUseCase
    participant Adapter as SupabaseAccountPersistenceAdapter
    participant Mapper as AccountMapper
    participant DB as Supabase DB
    
    Note over UseCase,DB: 永続化層でのモデル変換の詳細
    
    UseCase->>Adapter: loadAccount(accountId, baselineDate)
    
    rect rgb(200, 255, 200)
    Note over Adapter,DB: ① DBからデータを取得<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>アカウント情報と<br/>関連するアクティビティを取得<br/>━━━━━━━━━━━━━━━━━━<br/>ベースライン日付以前と以降の<br/>アクティビティを分けて取得
    end
    
    Adapter->>DB: SELECT * FROM accounts WHERE id = 1
    DB-->>Adapter: {id: 1}
    
    Adapter->>DB: SELECT * FROM activities<br/>WHERE owner_account_id = 1<br/>AND timestamp >= baselineDate
    DB-->>Adapter: [{id: 10, amount: 500, ...}, ...]
    
    Adapter->>DB: SELECT * FROM activities<br/>WHERE owner_account_id = 1<br/>AND timestamp < baselineDate
    DB-->>Adapter: [{id: 1, amount: 1000, ...}, ...]
    
    rect rgb(200, 240, 255)
    Note over Adapter,Mapper: ② エンティティの作成<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>DBレコードを<br/>型付きエンティティに変換<br/>━━━━━━━━━━━━━━━━━━<br/>PersistedActivityEntity:<br/>- id: number<br/>- timestamp: string<br/>- owner_account_id: number<br/>- amount: number
    end
    
    Note over Adapter: エンティティ作成:<br/>persistedActivitiesAfter: PersistedActivityEntity[]<br/>persistedActivitiesBefore: PersistedActivityEntity[]
    
    Adapter->>Mapper: calculateBaselineBalance(activitiesBefore, accountId)
    
    rect rgb(255, 220, 255)
    Note over Mapper: ③ ベースライン残高の計算<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>過去の全取引から<br/>現在の残高を計算する<br/>━━━━━━━━━━━━━━━━━━<br/>入金: balance += amount<br/>出金: balance -= amount
    end
    
    Mapper-->>Adapter: baselineBalance: bigint
    
    Note over Adapter: 集約エンティティ作成:<br/>AccountAggregateEntity {<br/>  account: {id: 1},<br/>  activities: [...],<br/>  baselineBalance: 5000<br/>}
    
    Adapter->>Mapper: toDomain(aggregate)
    
    rect rgb(200, 240, 255)
    Note over Mapper: ④ ドメインモデルへの変換<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>DBエンティティを<br/>ドメインモデルに変換<br/>━━━━━━━━━━━━━━━━━━<br/>・number → BigInt → AccountId<br/>・number → BigInt → Money<br/>・ActivityEntity[] → Activity[]<br/>・集約の再構成
    end
    
    Note over Mapper: 変換処理:<br/>1. new AccountId(BigInt(1))<br/>2. Money.of(BigInt(5000))<br/>3. activities.map(e => Activity.withId(...))<br/>4. new ActivityWindow(...activities)<br/>5. Account.withId(accountId, baselineBalance, activityWindow)
    
    Mapper-->>Adapter: Account (ドメインモデル)
    Adapter-->>UseCase: Account
    
    Note over UseCase: ビジネスロジック実行:<br/>account.withdraw(money, targetAccountId)
    
    UseCase->>Adapter: updateActivities(account)
    
    Adapter->>Mapper: toActivityEntities(account)
    
    rect rgb(200, 240, 255)
    Note over Mapper: ⑤ エンティティへの変換<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>ドメインモデルを<br/>DBエンティティに変換<br/>━━━━━━━━━━━━━━━━━━<br/>・新規アクティビティのみ抽出<br/>  (getId() === null)<br/>・AccountId → number<br/>・Money → number<br/>・Date → ISO文字列
    end
    
    Note over Mapper: 変換処理:<br/>newActivities.map(activity => ({<br/>  timestamp: activity.getTimestamp().toISOString(),<br/>  owner_account_id: Number(activity.getOwnerAccountId().getValue()),<br/>  amount: Number(activity.getMoney().getAmount())<br/>}))
    
    Mapper-->>Adapter: ActivityEntity[]<br/>[{timestamp: "2025-10-17T...", owner_account_id: 1, amount: 1000}]
    
    rect rgb(200, 255, 200)
    Note over Adapter,DB: ⑥ DBに挿入<br/>━━━━━━━━━━━━━━━━━━<br/>🎯 目的:<br/>新しいアクティビティを<br/>永続化する<br/>━━━━━━━━━━━━━━━━━━<br/>INSERTクエリを実行し<br/>取引履歴を記録
    end
    
    Adapter->>DB: INSERT INTO activities<br/>(timestamp, owner_account_id, source_account_id, ...)<br/>VALUES (...)
    DB-->>Adapter: 成功 (id: 11 が自動採番)
    Adapter-->>UseCase: 完了
```

---

## 🔗 関連ドキュメント

- [01-mapping-strategy.md](../architecture/01-mapping-strategy.md) - 双方向モデル変換の概要
- [02-layer-models.md](../architecture/02-layer-models.md) - 各層のモデルの詳細
- [03-mappers-guide.md](../architecture/03-mappers-guide.md) - マッパーの実装ガイド
- [layer-architecture.md](./layer-architecture.md) - レイヤーアーキテクチャの全体図
