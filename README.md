# BuckPal - Hexagonal Architecture with Hono + TypeScript

JavaのSpring Bootで実装されていた[buckpal](https://github.com/thombergs/buckpal)プロジェクトを、**Hono + TypeScript + tsyringe**で再実装したものです。

## 🏗️ アーキテクチャ

このプロジェクトは**ヘキサゴナルアーキテクチャ**（ポート＆アダプター）を採用しています。

### ディレクトリ構造

```
src/
├── application/              # アプリケーション層
│   ├── service/             # アプリケーションサービス（NEW: 調整・オーケストレーション）
│   │   └── SendMoneyApplicationService.ts
│   ├── domain/
│   │   ├── model/           # ドメインモデル（エンティティ・値オブジェクト）
│   │   │   ├── Money.ts
│   │   │   ├── Account.ts
│   │   │   ├── Activity.ts
│   │   │   └── ActivityWindow.ts
│   │   └── service/         # ドメインサービス（NEW: 純粋なビジネスロジック）
│   │       ├── SendMoneyDomainService.ts
│   │       ├── MoneyTransferProperties.ts
│   │       └── ThresholdExceededException.ts
│   └── port/
│       ├── in/              # 入力ポート（ユースケースインターフェース）
│       │   ├── SendMoneyUseCase.ts
│       │   └── SendMoneyCommand.ts
│       └── out/             # 出力ポート（リポジトリインターフェース）
│           ├── LoadAccountPort.ts
│           ├── UpdateAccountStatePort.ts
│           └── AccountLock.ts
├── adapter/                 # アダプター層（外部とのインターフェース）
│   ├── in/
│   │   └── web/            # Webアダプター（Hono）
│   │       ├── models/      # Web層専用モデル（NEW: プリミティブ型）
│   │       │   ├── SendMoneyWebRequest.ts
│   │       │   └── SendMoneyWebResponse.ts
│   │       ├── mappers/     # Web ↔ ドメイン変換（NEW）
│   │       │   └── SendMoneyMapper.ts
│   │       └── SendMoneyController.ts
│   └── out/
│       └── persistence/    # 永続化アダプター
│           ├── entities/    # DB専用エンティティ（NEW）
│           │   ├── AccountEntity.ts
│           │   └── ActivityEntity.ts
│           ├── mappers/     # ドメイン ↔ DB変換（NEW）
│           │   └── AccountMapper.ts
│           ├── InMemoryAccountPersistenceAdapter.ts
│           ├── SupabaseAccountPersistenceAdapter.ts
│           └── NoOpAccountLock.ts
├── config/                  # 設定
│   └── container.ts        # DIコンテナ（tsyringe）
└── index.ts                # エントリーポイント
```

### 双方向でのモデルの変換 ⭐

このプロジェクトでは、Tom Hombergs著「Get Your Hands Dirty on Clean Architecture」第9章で推奨されている**「双方向でのモデルの変換」**戦略を採用しています。

各層が独自のモデルを持ち、層の境界でマッパーを使って双方向に変換することで、完全な疎結合を実現しています。

```
┌─────────────────────────────────────────┐
│         Web層                            │
│  SendMoneyWebRequest (プリミティブ型)    │
│  SendMoneyWebResponse (プリミティブ型)   │
└────────────────┬────────────────────────┘
                 │ SendMoneyMapper
                 ↓ toCommand() / toSuccessResponse()
┌─────────────────────────────────────────┐
│      アプリケーション層                  │
│  SendMoneyCommand (値オブジェクト)       │
│  Account, Money (ドメインモデル)         │
└────────────────┬────────────────────────┘
                 │ AccountMapper
                 ↓ toDomain() / toActivityEntities()
┌─────────────────────────────────────────┐
│         永続化層                         │
│  AccountEntity, ActivityEntity           │
│  (DBテーブル構造)                        │
└─────────────────────────────────────────┘
```

#### メリット

- ✅ **完全な疎結合**: Web APIの形式を変更してもドメインモデルに影響しない
- ✅ **ドメインの純粋性**: ドメインモデルにWebやDBのアノテーションが不要
- ✅ **柔軟性**: APIのバージョニングやDBマイグレーションが容易
- ✅ **保守性**: 変更の影響範囲が明確
- ✅ **テスト容易性**: 各層を独立してテスト可能

#### 詳細ドキュメント

双方向モデル変換の詳細については、以下のドキュメントを参照してください：

- 📖 [双方向でのモデルの変換](docs/architecture/01-mapping-strategy.md) - 戦略の概要とメリット
- 📊 [各層のモデル](docs/architecture/02-layer-models.md) - Web層、ドメイン層、永続化層のモデル詳細
- 💻 [マッパーの実装ガイド](docs/architecture/03-mappers-guide.md) - マッパーの実装方法とベストプラクティス
- ⚖️ [戦略の比較](docs/architecture/04-strategy-comparison.md) - 3つのモデル変換戦略の比較
- 🔄 [変換フロー図](docs/diagrams/mapping-flow.md) - Mermaidシーケンス図で視覚化
- 🏗️ [レイヤーアーキテクチャ全体図](docs/diagrams/layer-architecture.md) - システム全体の構造

## 📖 本との相違点：アプリケーション層とドメイン層の分離

### 原著の実装方針

[Get Your Hands Dirty on Clean Architecture](https://www.amazon.com/Your-Hands-Dirty-Clean-Architecture/dp/180512837X)では、**小規模アプリケーションにおいては実用性を重視**し、以下のアプローチを取っています：

- `SendMoneyService`が**受信ポート実装 + ビジネスロジック + 送信ポート呼び出し**を全て担当
- アプリケーションサービスとドメインサービスを明示的に分離しない
- 理由：「サンプル程度の規模だと完全分離のコストが大きい」

### 本プロジェクトの実装方針

本プロジェクトでは、**理論的な図3.6に準拠した厳格な分離**を実装しています：

#### 1. アプリケーションサービス（`SendMoneyApplicationService`）
- **役割**: ユースケースの調整・オーケストレーション
- **責務**:
  - 受信ポート（`SendMoneyUseCase`）の実装
  - 送信ポートの管理（`LoadAccountPort`, `UpdateAccountStatePort`, `AccountLock`）
  - ドメインサービスの呼び出し
  - トランザクション境界の定義
  - リソース管理（ロック・解放）

```typescript
@injectable()
export class SendMoneyApplicationService implements SendMoneyUseCase {
  constructor(
    private readonly domainService: SendMoneyDomainService,  // ドメインサービスに依存
    private readonly loadAccountPort: LoadAccountPort,       // 送信ポートを管理
    private readonly updateAccountStatePort: UpdateAccountStatePort,
    private readonly accountLock: AccountLock,
    // ...
  ) {}
}
```

#### 2. ドメインサービス（`SendMoneyDomainService`）
- **役割**: 純粋なビジネスロジックのみを実装
- **責務**:
  - 送金トランザクションの実行
  - 限度額チェック
  - ドメインルールの適用

```typescript
@injectable()
export class SendMoneyDomainService {
  // ポートについて何も知らない！
  executeTransfer(
    sourceAccount: Account,
    targetAccount: Account,
    money: Money
  ): boolean {
    // 純粋なビジネスロジック
  }
}
```

### なぜ厳格に分離したのか？

1. **教育目的**: ヘキサゴナルアーキテクチャの原則を完全に理解するため
2. **保守性**: ビジネスルール変更とインフラ変更を完全に独立させる
3. **テスタビリティ**: ドメインロジックを完全に単体でテストできる
4. **スケーラビリティ**: 将来的な機能追加に備えた拡張性の確保

### トレードオフ

**利点**:
- ドメイン層がポートに一切依存しない（完全な依存性逆転）
- ビジネスロジックのテストがシンプル
- フレームワーク変更の影響範囲が限定的

**コスト**:
- クラス数が増加（アプリケーションサービス + ドメインサービス）
- 小規模アプリケーションではオーバーエンジニアリングの可能性

## 🚀 技術スタック

- **フレームワーク**: [Hono](https://hono.dev/) - 高速軽量なWebフレームワーク
- **ランタイム**: Cloudflare Workers（または Node.js）
- **DI コンテナ**: [tsyringe](https://github.com/microsoft/tsyringe)
- **バリデーション**: [Zod](https://zod.dev/)
- **言語**: TypeScript

## 📦 セットアップ

### 1. 依存関係のインストール

```bash
pnpm install
```

### 2. 開発サーバーの起動

```bash
pnpm dev
```

## 🧪 APIの使い方

### 送金API（パスパラメータ版）

```bash
# アカウント1からアカウント2へ500円を送金
curl -X POST http://localhost:8787/api/accounts/send/1/2/500
```

### 送金API（JSONボディ版）

```bash
# アカウント1からアカウント2へ1000円を送金
curl -X POST http://localhost:8787/api/accounts/send \
  -H "Content-Type: application/json" \
  -d '{"sourceAccountId": "1", "targetAccountId": "2", "amount": "1000"}'
```

**レスポンス例（成功）:**
```json
{
  "success": true,
  "message": "Money transfer completed successfully",
  "data": {
    "sourceAccountId": "1",
    "targetAccountId": "2",
    "amount": "1000",
    "timestamp": "2025-10-17T05:23:45.123Z"
  }
}
```

**レスポンス例（残高不足）:**
```json
{
  "success": false,
  "message": "Money transfer failed - insufficient balance",
  "error": {
    "code": "INSUFFICIENT_BALANCE"
  }
}
```

**レスポンス例（限度額超過）:**
```json
{
  "success": false,
  "message": "Maximum threshold for transferring money exceeded: tried to transfer 2000000 but threshold is 1000000!",
  "error": {
    "code": "THRESHOLD_EXCEEDED",
    "details": {
      "threshold": "1000000",
      "attempted": "2000000"
    }
  }
}
```

**レスポンス例（バリデーションエラー）:**
```json
{
  "success": false,
  "message": "Invalid request data",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {
      "errors": [
        {
          "path": ["amount"],
          "message": "amount must be a positive numeric string"
        }
      ]
    }
  }
}
```

### ヘルスチェック

```bash
curl http://localhost:8787/health
```

## 🎯 ヘキサゴナルアーキテクチャの利点

1. **ビジネスロジックの独立性**
   - ドメイン層は外部技術（DB、フレームワーク）に依存しない
   - テストが容易

2. **依存性逆転の原則**
   - ドメイン層がポート（インターフェース）を定義
   - アダプター層がポートを実装

3. **交換可能なアダプター**
   - InMemoryアダプター ⇔ Supabaseアダプター
   - Honoコントローラー ⇔ 他のWebフレームワーク

4. **テスタビリティ**
   - モックを注入しやすい
   - ユニットテストが書きやすい

5. **責務の明確な分離**（本プロジェクト独自）
   - アプリケーションサービス：調整・ポート管理
   - ドメインサービス：純粋なビジネスロジック
   - マッパー：層間のモデル変換

6. **完全な疎結合**（双方向モデル変換）
   - 各層が独自のモデルを持ち、他の層に依存しない
   - Web APIやDBの変更がドメインモデルに影響しない

## 🔧 DIコンテナ（tsyringe）の使い方

`src/config/container.ts`で依存関係を登録：

```typescript
// ドメインサービスの登録
container.registerSingleton(SendMoneyDomainService, SendMoneyDomainService);

// アプリケーションサービス（ユースケース）の登録
container.register(SendMoneyUseCaseToken, {
  useClass: SendMoneyApplicationService,
});

// 永続化アダプターの登録
container.register(LoadAccountPortToken, {
  useToken: InMemoryAccountPersistenceAdapter,
});
```

コントローラーで使用：

```typescript
const sendMoneyUseCase = container.resolve<SendMoneyUseCase>(
  SendMoneyUseCaseToken
);
```

## 📚 元のJavaプロジェクト

- [thombergs/buckpal](https://github.com/thombergs/buckpal)
- 書籍: [Get Your Hands Dirty on Clean Architecture](https://www.amazon.com/Your-Hands-Dirty-Clean-Architecture/dp/180512837X)
  - 日本語版: [手を動かしてわかるクリーンアーキテクチャ　ヘキサゴナルアーキテクチャによるクリーンなアプリケーション開発](https://www.amazon.co.jp/dp/B0CKK8CRQC)

## 🎓 学習リソース

### ヘキサゴナルアーキテクチャ
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

### このプロジェクトのドキュメント
- [双方向でのモデルの変換](docs/architecture/01-mapping-strategy.md)
- [各層のモデル](docs/architecture/02-layer-models.md)
- [マッパーの実装ガイド](docs/architecture/03-mappers-guide.md)
- [戦略の比較](docs/architecture/04-strategy-comparison.md)
- [変換フロー図](docs/diagrams/mapping-flow.md)
- [レイヤーアーキテクチャ全体図](docs/diagrams/layer-architecture.md)

### 技術スタック
- [Hono Documentation](https://hono.dev/)
- [tsyringe Documentation](https://github.com/microsoft/tsyringe)
- [Zod Documentation](https://zod.dev/)

## 📝 次のステップ

- [x] Supabase永続化アダプターの実装
- [x] 双方向でのモデルの変換の実装
- [ ] 残高照会ユースケースの実装
- [ ] ドメインサービスのユニットテスト追加（Vitest）
- [ ] アプリケーションサービスの統合テスト追加
- [ ] マッパーのユニットテスト追加
- [ ] API仕様書の生成（OpenAPI/Swagger）
- [ ] ロギングとエラーハンドリングの改善

## 📄 ライセンス

MIT
