# BuckPal - Hexagonal Architecture with Hono + TypeScript

JavaのSpring Bootで実装されていた[buckpal](https://github.com/thombergs/buckpal)プロジェクトを、**Hono + TypeScript + tsyringe**で再実装したものです。

## 🏗️ アーキテクチャ

このプロジェクトは**ヘキサゴナルアーキテクチャ**（ポート＆アダプター）を採用しています。

```
src/
├── application/              # アプリケーション層（ビジネスロジック）
│   ├── domain/
│   │   ├── model/           # ドメインモデル（エンティティ・値オブジェクト）
│   │   │   ├── Money.ts
│   │   │   ├── Account.ts
│   │   │   ├── Activity.ts
│   │   │   └── ActivityWindow.ts
│   │   └── service/         # ドメインサービス（ユースケース実装）
│   │       ├── SendMoneyService.ts
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
│   │       └── SendMoneyController.ts
│   └── out/
│       └── persistence/    # 永続化アダプター
│           ├── InMemoryAccountPersistenceAdapter.ts
│           └── NoOpAccountLock.ts
├── config/                  # 設定
│   └── container.ts        # DIコンテナ（tsyringe）
└── index.ts                # エントリーポイント
```

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

### 送金API

```bash
# アカウント1からアカウント2へ500円を送金
curl -X POST http://localhost:8787/api/accounts/send/1/2/500
```

**レスポンス例（成功）:**
```json
{
  "success": true,
  "message": "Money transfer completed successfully"
}
```

**レスポンス例（残高不足）:**
```json
{
  "success": false,
  "message": "Money transfer failed - insufficient balance"
}
```

**レスポンス例（限度額超過）:**
```json
{
  "success": false,
  "message": "Maximum threshold for transferring money exceeded: tried to transfer 2000000 but threshold is 1000000!",
  "threshold": "1000000",
  "attempted": "2000000"
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

## 🔧 DIコンテナ（tsyringe）の使い方

`src/config/container.ts`で依存関係を登録：

```typescript
// ユースケースの登録
container.register(SendMoneyUseCase as symbol, {
  useClass: SendMoneyService,
});

// 永続化アダプターの登録
container.register(LoadAccountPort as symbol, {
  useToken: InMemoryAccountPersistenceAdapter,
});
```

コントローラーで使用：

```typescript
const sendMoneyUseCase = container.resolve<SendMoneyUseCase>(
  SendMoneyUseCase as symbol
);
```

## 📚 元のJavaプロジェクト

- [thombergs/buckpal](https://github.com/thombergs/buckpal)
- 書籍: [Get Your Hands Dirty on Clean Architecture](https://www.amazon.com/Your-Hands-Dirty-Clean-Architecture/dp/180512837X)

## 🎓 学習リソース

- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Hono Documentation](https://hono.dev/)
- [tsyringe Documentation](https://github.com/microsoft/tsyringe)

## 📝 次のステップ

- [ ] Supabase永続化アダプターの実装
- [ ] 残高照会ユースケースの実装
- [ ] ユニットテストの追加（Vitest）
- [ ] 統合テストの追加
- [ ] API仕様書の生成（OpenAPI/Swagger）
- [ ] ロギングとエラーハンドリングの改善

## 📄 ライセンス

MIT
