# アーキテクチャ境界の維持

このプロジェクトでは、ESLintを使用してヘキサゴナルアーキテクチャの境界を自動的にチェックしています。

## 設定されているルール

### 1. ドメイン層の隔離

ドメイン層は最も内側の層で、他のどの層にも依存してはいけません。

```typescript
// ❌ 禁止
// src/application/domain/model/Account.ts
import { AccountController } from '@/adapter/in/web/AccountController';

// ✅ 正しい
// src/application/domain/model/Account.ts
import { Money } from './Money';
import { Activity } from './Activity';
```

### 2. ポート層の制限

ポート層はインターフェース定義の層で、アダプタやサービスの実装に依存してはいけません。

```typescript
// ❌ 禁止
// src/application/port/in/SendMoneyUseCase.ts
import { SendMoneyService } from '@/application/service/SendMoneyService';

// ✅ 正しい
// src/application/port/in/SendMoneyUseCase.ts
import { Money } from '@/application/domain/model/Money';
```

### 3. サービス層の制限

サービス層はドメインとポートにのみ依存できます。

```typescript
// ❌ 禁止
// src/application/service/SendMoneyService.ts
import { AccountController } from '@/adapter/in/web/AccountController';

// ✅ 正しい
// src/application/service/SendMoneyService.ts
import { Account } from '@/application/domain/model/Account';
import { LoadAccountPort } from '@/application/port/out/LoadAccountPort';
```

### 4. アダプタ間の独立性

入力アダプタと出力アダプタは互いに依存してはいけません。

```typescript
// ❌ 禁止
// src/adapter/in/web/AccountController.ts
import { AccountPersistenceAdapter } from '@/adapter/out/persistence/AccountPersistenceAdapter';

// ✅ 正しい
// src/adapter/in/web/AccountController.ts
import { SendMoneyUseCase } from '@/application/port/in/SendMoneyUseCase';
```

### 5. ポート経由のアクセス

アダプタはサービスの実装に直接依存せず、ポート（インターフェース）経由でアクセスします。

```typescript
// ❌ 禁止
// src/adapter/in/web/AccountController.ts
import { SendMoneyService } from '@/application/service/SendMoneyService';

// ✅ 正しい
// src/adapter/in/web/AccountController.ts
import { SendMoneyUseCase } from '@/application/port/in/SendMoneyUseCase';
```

## コマンド

### すべてのファイルをチェック

```bash
pnpm lint
```

### 自動修正できるものを修正

```bash
pnpm lint:fix
```

### アーキテクチャ検証（CI用・警告もエラー扱い）

```bash
pnpm arch:validate
```

## WebStormでの使い方

### 1. ESLintの有効化

1. **設定を開く**: `Cmd + ,` (macOS) または `Ctrl + Alt + S` (Windows/Linux)
2. **Languages & Frameworks > JavaScript > Code Quality Tools > ESLint**に移動
3. 以下をチェック：
    - ✅ Automatic ESLint configuration
    - ✅ Run eslint --fix on save

### 2. リアルタイムエラー表示

ルール違反があると、コードエディタに赤い波線が表示されます。

### 3. クイックフィックス

- **Alt + Enter**でクイックフィックスメニューを表示
- 自動修正可能な問題は自動的に修正できます

## VS Codeでの使い方

### 1. ESLint拡張機能のインストール

VS Code Marketplaceから「ESLint」拡張機能をインストールしてください。

### 2. 設定

`.vscode/settings.json`を作成（既にある場合は追加）：

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.validate": [
    "javascript",
    "typescript"
  ],
  "eslint.format.enable": true,
  "eslint.useFlatConfig": true
}
```

## CI/CDでの自動チェック

GitHub Actionsで自動的にアーキテクチャルールをチェックします。

- **トリガー**: `main`ブランチへのプッシュ、またはプルリクエスト
- **チェック内容**: すべてのアーキテクチャルール違反を検出
- **結果**: 違反があればビルドが失敗します

## よくある質問

### Q: なぜこのルールが必要なのですか？

A: ヘキサゴナルアーキテクチャでは、依存の方向が「外側から内側へ」という原則があります。この原則を守ることで：

- ✅ ドメインロジックが純粋で再利用可能になる
- ✅ テストが書きやすくなる
- ✅ 技術的な詳細（データベース、フレームワーク）を簡単に変更できる

### Q: ルールに違反したらどうなりますか？

A: ESLintがエラーを表示し、以下のような場所で通知されます：

1. エディタ（WebStorm/VS Code）にリアルタイムで赤い波線が表示される
2. `pnpm lint`を実行するとエラーメッセージが表示される
3. GitHub Actionsでビルドが失敗する

### Q: ルールを無効化できますか？

A: 技術的には可能ですが、**推奨しません**。どうしても必要な場合は、チームで議論してから`eslint.config.js`を修正してください。

### Q: 新しいルールを追加できますか？

A: はい！`eslint.config.js`の`zones`配列に新しいルールを追加できます。

## 参考資料

- [Get Your Hands Dirty on Clean Architecture](https://github.com/thombergs/buckpal) - 元のJavaプロジェクト
- [ESLint公式ドキュメント](https://eslint.org/docs/latest/)
- [eslint-plugin-import](https://github.com/import-js/eslint-plugin-import)