import {inject, injectable} from 'tsyringe';
import {MoneyTransferProperties, MoneyTransferPropertiesToken} from '../domain/service/MoneyTransferProperties';
import {SendMoneyDomainService} from '../domain/service/SendMoneyDomainService';
import {SendMoneyCommand} from '../port/in/SendMoneyCommand';
import {SendMoneyUseCase} from '../port/in/SendMoneyUseCase';
import {AccountLock, AccountLockToken} from '../port/out/AccountLock';
import {LoadAccountPort, LoadAccountPortToken} from '../port/out/LoadAccountPort';
import {UpdateAccountStatePort, UpdateAccountStatePortToken} from '../port/out/UpdateAccountStatePort';

/**
 * 送金アプリケーションサービス
 *
 * 役割: ユースケースの調整・オーケストレーション
 * - 受信ポート（SendMoneyUseCase）を実装
 * - 送信ポートを管理
 * - ドメインサービスを呼び出す
 * - トランザクション境界を定義
 *
 * 【責務の明確化】
 * - ビジネスルールの検証 → ドメインサービスに委譲 ✅
 * - データの取得・永続化 → このサービスで調整 ✅
 * - トランザクション管理 → このサービスで制御 ✅
 *
 * ========================================
 * 【DI（依存性注入）の観点】
 * ========================================
 *
 * このクラスは「依存性の逆転原則（DIP）」を体現しています：
 *
 * ❌ 悪い例（従来の依存方向）:
 *   Application層 → Adapter層（具体的な実装に依存）
 *   例: new SupabaseAccountPersistenceAdapter() を直接呼ぶ
 *
 * ✅ 良い例（依存性の逆転）:
 *   Application層 → Port（インターフェース）に依存
 *   Adapter層 → Port を実装
 *
 *   つまり：
 *   Application層は「何ができるか」（Port）だけ知っている
 *   Application層は「どうやって実現するか」（Adapter）を知らない
 *
 * これにより：
 * - テストが容易（モックに差し替え可能）
 * - 実装の切り替えが容易（InMemory ⇔ Supabase ⇔ Prisma）
 * - アプリケーション層のコードが安定（実装変更の影響を受けない）
 */

/**
 * @injectable() デコレータ
 *
 * 【意味】
 * 「このクラスはDIコンテナで管理できます」という宣言。
 * tsyringe がこのクラスのメタデータを読み取り、
 * 依存関係を自動解決できるようにする。
 *
 * 【なぜ必要か】
 * TypeScript のデコレータとリフレクション機能を使って、
 * コンストラクタの引数情報を実行時に取得するため。
 *
 * これがないと、tsyringe は：
 * - どんな依存が必要か分からない
 * - 自動的にインスタンスを作れない
 */
@injectable()
export class SendMoneyApplicationService implements SendMoneyUseCase {
    /**
     * コンストラクタ（依存性注入の受け口）
     *
     * ========================================
     * 【@inject デコレータの役割】
     * ========================================
     *
     * 各引数の @inject() は「この依存をどう解決するか」を指示します。
     *
     * 実行時の流れ：
     * 1. container.resolve(SendMoneyUseCaseToken) が呼ばれる
     * 2. コンテナ: 「SendMoneyApplicationService を作ろう」
     * 3. コンテナ: 「コンストラクタを見て、必要な依存を確認」
     * 4. コンテナ: 「各 @inject で指定されたTokenを順番に解決」
     * 5. コンテナ: 「全ての依存が揃ったのでインスタンス作成」
     *
     * ========================================
     * 【private readonly の意味と効果】
     * ========================================
     *
     * コンストラクタ引数に `private readonly` を付けると、
     * TypeScriptの「パラメータプロパティ」という機能により、
     * 以下の3つが自動的に行われます：
     *
     * 1. クラスのプロパティ宣言
     * 2. コンストラクタ引数からプロパティへの代入
     * 3. アクセス修飾子（private）と変更防止（readonly）の適用
     *
     * 【従来の書き方（冗長）】
     * ```typescript
     * class SendMoneyApplicationService {
     *     // ① プロパティを宣言
     *     private readonly domainService: SendMoneyDomainService;
     *
     *     constructor(
     *         domainService: SendMoneyDomainService
     *     ) {
     *         // ② 手動で代入
     *         this.domainService = domainService;
     *     }
     * }
     * ```
     *
     * 【パラメータプロパティを使った書き方（簡潔）】
     * ```typescript
     * class SendMoneyApplicationService {
     *     constructor(
     *         // private readonly を付けるだけで上記①②が自動実行される！
     *         private readonly domainService: SendMoneyDomainService
     *     ) {}
     * }
     * ```
     *
     * ========================================
     * 【private の効果】
     * ========================================
     *
     * カプセル化を実現する修飾子。
     *
     * ✅ クラス内部からはアクセス可能：
     * ```typescript
     * async sendMoney(command: SendMoneyCommand): Promise<void> {
     *     // OK: クラス内部なので使える
     *     this.domainService.executeTransfer(...);
     * }
     * ```
     *
     * ❌ クラス外部からはアクセス不可：
     * ```typescript
     * const service = container.resolve(SendMoneyUseCaseToken);
     * service.domainService.executeTransfer(...);
     * //      ^^^^^^^^^^^^^
     * //      エラー: Property 'domainService' is private
     * ```
     *
     * メリット：
     * - 内部実装の隠蔽（Encapsulation）
     * - 意図しない外部からの操作を防ぐ
     * - 公開APIと内部実装を明確に分離
     *
     * ========================================
     * 【readonly の効果】
     * ========================================
     *
     * イミュータビリティ（不変性）を保証する修飾子。
     *
     * ✅ 読み取りは可能：
     * ```typescript
     * async sendMoney(command: SendMoneyCommand): Promise<void> {
     *     // OK: 読み取りは何度でも可能
     *     this.domainService.executeTransfer(...);
     * }
     * ```
     *
     * ❌ 再代入は不可：
     * ```typescript
     * async sendMoney(command: SendMoneyCommand): Promise<void> {
     *     // エラー: Cannot assign to 'domainService'
     *     // because it is a read-only property
     *     this.domainService = new AnotherDomainService();
     * }
     * ```
     *
     * メリット：
     * - 一度注入された依存が変更されないことを保証
     * - バグの防止（意図しない再代入を防ぐ）
     * - コードの意図が明確（「この依存は不変です」と伝わる）
     *
     * ========================================
     * 【private readonly を組み合わせる理由】
     * ========================================
     *
     * DIコンテナで注入される依存は、以下の特性を持つべき：
     *
     * 1. **外部から触らせない（private）**
     *    - 依存はクラスの内部実装の一部
     *    - 外部に公開する必要はない
     *    - カプセル化の原則に従う
     *
     * 2. **変更させない（readonly）**
     *    - 注入された依存は固定であるべき
     *    - 実行中に依存が変わるとバグの温床になる
     *    - イミュータビリティの原則に従う
     *
     * 具体例：
     * ```typescript
     * // ✅ 正しい使い方
     * async sendMoney(command: SendMoneyCommand): Promise<void> {
     *     // 注入された依存を使ってビジネスロジックを実行
     *     this.domainService.executeTransfer(...);
     * }
     *
     * // ❌ もし private がなかったら...
     * const service = container.resolve(SendMoneyUseCaseToken);
     * service.domainService = maliciousService; // 外部から改ざん可能
     *
     * // ❌ もし readonly がなかったら...
     * async sendMoney(command: SendMoneyCommand): Promise<void> {
     *     // 誤って再代入してしまうバグ
     *     this.domainService = null;
     *     this.domainService.executeTransfer(...); // クラッシュ！
     * }
     * ```
     *
     * ========================================
     * 【なぜインターフェース（Port）に依存するのか】
     * ========================================
     *
     * 例えば loadAccountPort の型は LoadAccountPort（インターフェース）です。
     * 実際に注入されるのは SupabaseAccountPersistenceAdapter（実装）ですが、
     * このクラスはそれを知りません。
     *
     * メリット：
     * - Supabase の詳細を知らなくて良い
     * - Prisma に切り替えても、このコードは変更不要
     * - テスト時にモックに差し替え可能
     *
     * これが「依存性の逆転」の本質です！
     */
    constructor(
        /**
         * 【依存1】SendMoneyDomainService
         *
         * ========================================
         * 構文の詳細：
         * ========================================
         * @inject(SendMoneyDomainService)  ← DIコンテナへの指示
         * private readonly                 ← アクセス制御 + 不変性保証
         * domainService:                   ← プロパティ名（this.domainService でアクセス）
         * SendMoneyDomainService          ← 型（TypeScriptの型チェック用）
         *
         * ========================================
         * 実行時の動作：
         * ========================================
         *
         * コンテナが resolve を実行すると：
         *
         * 1. @inject(SendMoneyDomainService) を見て
         *    「SendMoneyDomainService のインスタンスが必要だな」と判断
         *
         * 2. container.ts の登録を確認：
         *    ```typescript
         *    container.registerSingleton(SendMoneyDomainService);
         *    ```
         *    「シングルトンとして登録されてるな」
         *
         * 3. 既存インスタンスがあればそれを返す、なければ作成
         *
         * 4. private readonly により、以下が自動実行される：
         *    ```typescript
         *    this.domainService = [注入されたインスタンス];
         *    ```
         *
         * 5. 以降、this.domainService で使える
         *    - 外部からはアクセス不可（private）
         *    - 再代入不可（readonly）
         *
         * ========================================
         * なぜシングルトンで良いのか：
         * ========================================
         *
         * - ドメインサービスはステートレス（状態を持たない）
         * - 純粋なビジネスロジックのみを持つ
         * - 複数リクエスト間で共有しても問題ない
         */
        @inject(SendMoneyDomainService)
        private readonly domainService: SendMoneyDomainService,

        /**
         * 【依存2】LoadAccountPort（読み込みポート）
         *
         * ========================================
         * 構文の詳細：
         * ========================================
         * @inject(LoadAccountPortToken)    ← Tokenで解決（インターフェースへの依存）
         * private readonly                 ← アクセス制御 + 不変性保証
         * loadAccountPort:                 ← プロパティ名
         * LoadAccountPort                  ← 型はインターフェース（抽象への依存）
         *
         * ========================================
         * 依存性の逆転原則（DIP）のポイント：
         * ========================================
         *
         * 型は LoadAccountPort（インターフェース）
         * ↓ しかし実際に注入されるのは...
         *
         * container.ts の登録：
         * ```typescript
         * container.register(LoadAccountPortToken, {
         *   useToken: SupabaseAccountPersistenceAdapter,
         * });
         * ```
         * → SupabaseAccountPersistenceAdapter（具体実装）が注入される
         *
         * ========================================
         * 【重要】このクラスは具体的な実装を知らない！
         * ========================================
         *
         * このクラスから見ると：
         * - 「アカウントを読み込める何か」があればOK
         * - それが Supabase なのか、InMemory なのか、Prisma なのかは関係ない
         * - LoadAccountPort インターフェースに定義されたメソッドを呼べれば良い
         *
         * 利点：
         * 1. テスト容易性
         *    ```typescript
         *    // テストでは別の実装を注入
         *    container.register(LoadAccountPortToken, {
         *      useValue: mockLoadAccountPort,
         *    });
         *    ```
         *
         * 2. 実装の切り替えが容易
         *    ```typescript
         *    // 環境変数を変えるだけで切り替わる
         *    // container.ts のコードを修正するだけ
         *    // このクラスは変更不要！
         *    ```
         *
         * 3. Application層の安定性
         *    - Supabase の API が変わっても
         *    - Adapter層だけ修正すればOK
         *    - このクラスは影響を受けない
         */
        @inject(LoadAccountPortToken)
        private readonly loadAccountPort: LoadAccountPort,

        /**
         * 【依存3】UpdateAccountStatePort（更新ポート）
         *
         * ========================================
         * 同じインスタンスの共有：
         * ========================================
         *
         * container.ts で useToken を使っているため：
         * ```typescript
         * container.register(LoadAccountPortToken, {
         *   useToken: SupabaseAccountPersistenceAdapter,
         * });
         * container.register(UpdateAccountStatePortToken, {
         *   useToken: SupabaseAccountPersistenceAdapter,
         * });
         * ```
         *
         * 結果：
         * this.loadAccountPort === this.updateAccountStatePort // true
         *
         * つまり、両方とも同じ SupabaseAccountPersistenceAdapter インスタンスを指している。
         *
         * ========================================
         * なぜこうするのか：
         * ========================================
         *
         * 1. 1つのアダプターが複数のポートを実装している
         *    ```typescript
         *    class SupabaseAccountPersistenceAdapter
         *      implements LoadAccountPort, UpdateAccountStatePort {
         *      // 両方のメソッドを実装
         *    }
         *    ```
         *
         * 2. 同じDBコネクション・トランザクションを共有したい
         *    - 読み込みと更新で別々のインスタンスだと、
         *      トランザクション管理が難しくなる
         *
         * 3. メモリ効率
         *    - 同じ責務なら1つのインスタンスで十分
         *
         * ========================================
         * でも、このクラスは知らなくてOK：
         * ========================================
         *
         * このクラスは：
         * - 「たまたま同じインスタンス」かどうかを知る必要はない
         * - それぞれのインターフェース（Port）を通じて使うだけ
         * - 将来、別々のインスタンスに変更されても問題ない
         *
         * これがカプセル化の利点！
         */
        @inject(UpdateAccountStatePortToken)
        private readonly updateAccountStatePort: UpdateAccountStatePort,

        /**
         * 【依存4】AccountLock（アカウントロック機構）
         *
         * ========================================
         * 実装の切り替え可能性：
         * ========================================
         *
         * 現在の登録（container.ts）：
         * ```typescript
         * container.register(AccountLockToken, {
         *   useClass: NoOpAccountLock,
         * });
         * ```
         * → NoOpAccountLock（何もしない実装）が注入される
         *
         * 将来の拡張例：
         * ```typescript
         * // Redis を使った分散ロック
         * container.register(AccountLockToken, {
         *   useClass: RedisAccountLock,
         * });
         *
         * // データベースロック
         * container.register(AccountLockToken, {
         *   useClass: DatabaseAccountLock,
         * });
         * ```
         *
         * ========================================
         * このクラスのコードは変更不要：
         * ========================================
         *
         * どの実装が注入されても：
         * ```typescript
         * this.accountLock.lockAccount(accountId);
         * // ↑ このコードは変わらない
         * ```
         *
         * - NoOpAccountLock: 何もしない
         * - RedisAccountLock: Redis でロック
         * - DatabaseAccountLock: DB でロック
         *
         * 全て同じインターフェース（AccountLock）を実装しているので、
         * 使う側は実装の違いを意識する必要がない！
         */
        @inject(AccountLockToken)
        private readonly accountLock: AccountLock,

        /**
         * 【依存5】MoneyTransferProperties（送金設定）
         *
         * ========================================
         * 既存インスタンスの注入：
         * ========================================
         *
         * container.ts での登録：
         * ```typescript
         * const transferThreshold = Money.of(1_000_000);
         * const properties = new MoneyTransferProperties(transferThreshold);
         *
         * container.register(MoneyTransferPropertiesToken, {
         *   useValue: properties,  // ← 既に作成済みのインスタンス
         * });
         * ```
         *
         * useValue の意味：
         * - コンテナが新規作成するのではない
         * - setupContainer() で作ったインスタンスをそのまま使う
         * - 設定オブジェクトなど、事前に初期化が必要なものに使う
         *
         * ========================================
         * なぜ事前に作るのか：
         * ========================================
         *
         * 送金上限などの設定値は：
         * - 環境変数から読み込む
         * - 複雑な初期化ロジックがある
         * - 全てのサービスで共有したい
         *
         * だから：
         * 1. アプリ起動時に1回だけ作成
         * 2. その後は同じインスタンスを使い回す
         * 3. 全てのサービスで同じ設定を参照できる
         */
        @inject(MoneyTransferPropertiesToken)
        private readonly moneyTransferProperties: MoneyTransferProperties
    ) {
        /**
         * ========================================
         * コンストラクタのボディは空
         * ========================================
         *
         * なぜ？
         *
         * 1. 依存の注入は tsyringe が自動的に行う
         * 2. private readonly により自動的にプロパティに代入される
         * 3. 手動で何かを初期化する必要がない
         *
         * ========================================
         * この時点で既に完了していること：
         * ========================================
         *
         * ```typescript
         * // 以下が自動的に実行済み（書かなくてOK）
         * this.domainService = [注入されたインスタンス];
         * this.loadAccountPort = [注入されたインスタンス];
         * this.updateAccountStatePort = [注入されたインスタンス];
         * this.accountLock = [注入されたインスタンス];
         * this.moneyTransferProperties = [注入されたインスタンス];
         * ```
         *
         * ========================================
         * もし DIコンテナがなかったら：
         * ========================================
         *
         * ```typescript
         * constructor(
         *   domainService: SendMoneyDomainService,
         *   loadAccountPort: LoadAccountPort,
         *   // ...
         * ) {
         *   // 手動で代入が必要
         *   this.domainService = domainService;
         *   this.loadAccountPort = loadAccountPort;
         *   // ...
         * }
         * ```
         *
         * private readonly + DIコンテナの組み合わせで、
         * これらの退屈なボイラープレートが不要になる！
         */
    }

    /**
     * 送金を実行（ユースケースの調整）
     *
     * ========================================
     * 【DIと実行時の関係】
     * ========================================
     *
     * このメソッドが呼ばれる時：
     * 1. DIコンテナは既に全ての依存を解決済み
     * 2. this.loadAccountPort などは全て使える状態
     * 3. 注入された実装が何かは気にしなくてOK
     *
     * 例えば：
     * ```typescript
     * const sourceAccount = await this.loadAccountPort.loadAccount(...);
     * ```
     *
     * 実行時の実態：
     * - 本番環境: SupabaseAccountPersistenceAdapter.loadAccount() が呼ばれる
     * - テスト環境: InMemoryAccountPersistenceAdapter.loadAccount() が呼ばれる
     * - または: モックの loadAccount() が呼ばれる
     *
     * でも、このコードは変わらない！
     * これが「依存性の逆転」がもたらす柔軟性です。
     *
     * ========================================
     * 【private readonly が守っているもの】
     * ========================================
     *
     * このメソッド内で：
     *
     * ✅ できること（意図された使い方）:
     * ```typescript
     * this.domainService.executeTransfer(...);        // 読み取り・呼び出し
     * await this.loadAccountPort.loadAccount(...);    // 読み取り・呼び出し
     * ```
     *
     * ❌ できないこと（バグの防止）:
     * ```typescript
     * this.domainService = null;                      // エラー: readonly
     * this.loadAccountPort = anotherAdapter;          // エラー: readonly
     * ```
     *
     * これにより：
     * - 意図しない再代入によるバグを防ぐ
     * - 依存の安定性を保証する
     * - コードの意図が明確になる
     *
     * @throws SameAccountTransferException 同一アカウント送金の場合
     * @throws ThresholdExceededException 限度額超過の場合
     * @throws InsufficientBalanceException 残高不足の場合
     * @throws Error その他のエラー
     */
    async sendMoney(command: SendMoneyCommand): Promise<void> {
        // ① データ取得: アカウントをロード
        const baselineDate = new Date();
        baselineDate.setDate(baselineDate.getDate() - 10);

        /**
         * loadAccountPort を使用
         *
         * DIにより注入されたインスタンスを使う。
         * 具体的な実装（Supabase/InMemory）は気にしない。
         * Port（インターフェース）のメソッドを呼ぶだけ。
         *
         * private により：
         * - 外部から this.loadAccountPort を触られることはない
         *
         * readonly により：
         * - このメソッド内で誤って再代入することもない
         */
        const sourceAccount = await this.loadAccountPort.loadAccount(
            command.sourceAccountId,
            baselineDate
        );

        const targetAccount = await this.loadAccountPort.loadAccount(
            command.targetAccountId,
            baselineDate
        );

        const sourceAccountId = sourceAccount.getId();
        const targetAccountId = targetAccount.getId();

        if (!sourceAccountId || !targetAccountId) {
            throw new Error('Expected account ID not to be empty');
        }

        // ② リソースロック
        /**
         * accountLock を使用
         *
         * 現在は NoOpAccountLock（何もしない）が注入されているが、
         * 将来 Redis ロックなどに変更しても、このコードは変わらない。
         *
         * private readonly により：
         * - 外部から触られない + 再代入されない = 安全
         */
        this.accountLock.lockAccount(sourceAccountId);
        this.accountLock.lockAccount(targetAccountId);

        try {
            // ③ ビジネスロジック実行（例外が throw される）
            /**
             * domainService と moneyTransferProperties を使用
             *
             * 両方とも：
             * - DIにより注入されたインスタンス
             * - private readonly で保護されている
             * - 外部から触られることも、誤って再代入されることもない
             */
            this.domainService.executeTransfer(
                sourceAccount,
                targetAccount,
                command.money,
                this.moneyTransferProperties.maximumTransferThreshold
            );

            // ④ 永続化: アカウント状態を更新
            /**
             * updateAccountStatePort を使用
             *
             * DIにより注入されたインスタンスを使う。
             * 実際は SupabaseAccountPersistenceAdapter かもしれないし、
             * InMemoryAccountPersistenceAdapter かもしれない。
             *
             * このクラスは知らなくてOK。
             * Port のメソッドを呼べばちゃんと動く！
             *
             * private readonly により保護されている。
             */
            await this.updateAccountStatePort.updateActivities(sourceAccount);
            await this.updateAccountStatePort.updateActivities(targetAccount);

            // ✅ 成功時は何も返さない（void）
        } finally {
            // ⑤ リソース解放（必ず実行）
            /**
             * accountLock を使用
             *
             * 注入されたロック実装を使ってリソースを解放。
             * private readonly により保護されている。
             */
            this.accountLock.releaseAccount(sourceAccountId);
            this.accountLock.releaseAccount(targetAccountId);
        }
    }
}

/**
 * ========================================
 * 【まとめ：DIコンテナ + private readonly がもたらすメリット】
 * ========================================
 *
 * 1. 疎結合（Loose Coupling）
 *    - Application層は Adapter層の具体実装を知らない
 *    - Port（インターフェース）にのみ依存
 *    - 実装は外部から注入される
 *
 * 2. テスト容易性（Testability）
 *    - テストでは別の実装（モック）を注入できる
 *    - このクラスのコードは変更不要
 *    - 単体テストが書きやすい
 *
 * 3. 柔軟性（Flexibility）
 *    - Supabase → Prisma への切り替えが container.ts のみで完結
 *    - Application層のコードは変更不要
 *    - 新しい実装を追加しても既存コードに影響しない
 *
 * 4. 保守性（Maintainability）
 *    - 依存関係の管理が一元化される（container.ts）
 *    - 「どの実装を使うか」はビジネスロジックから分離
 *    - コードの意図が明確
 *
 * 5. 安全性（Safety）
 *    - private: 外部からの不正なアクセスを防ぐ
 *    - readonly: 意図しない再代入を防ぐ
 *    - コンパイル時にエラーを検出できる
 *
 * 6. 単一責任原則（SRP）
 *    - このクラスは「ユースケースの調整」に集中
 *    - 「依存の作成」はDIコンテナが担当
 *    - 「依存の保護」はprivate readonlyが担当
 *
 * 7. 開放閉鎖原則（OCP）
 *    - 拡張に対して開いている（新しいAdapterを追加可能）
 *    - 変更に対して閉じている（既存のApplication層は変更不要）
 *
 * ========================================
 * 【依存性の逆転原則（DIP）の実現】
 * ========================================
 *
 * 従来のアーキテクチャ（依存の向き）：
 * ```
 * Controller → Service → Repository（具体実装）
 *                ↓
 *         具体的な実装に依存
 *         変更の影響を受けやすい
 * ```
 *
 * ヘキサゴナルアーキテクチャ + DI + private readonly（依存の向き）：
 * ```
 * Controller → Application Service → Port（インターフェース）
 *                                      ↑
 *                                   Adapter（実装）
 *                                      ↑
 *                               DIコンテナが注入
 *                               private readonly で保護
 *
 * Application層は抽象に依存
 * Adapter層も抽象（Port）に依存
 * → 依存の向きが「逆転」している！
 * → private readonly で依存が保護されている！
 * ```
 *
 * これにより：
 * - Application層は安定（変更に強い）
 * - Adapter層は交換可能（柔軟性が高い）
 * - テストが容易（モックに差し替え可能）
 * - 依存が保護される（バグが入りにくい）
 * - コードの意図が明確（読みやすい・保守しやすい）
 */