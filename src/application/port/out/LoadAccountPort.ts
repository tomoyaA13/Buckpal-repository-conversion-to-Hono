import {Account} from '../../domain/model/Account';
import {AccountId} from '../../domain/model/Activity';


// 依存関係の向き(永続化層がアプリケーション層に依存する)
// 永続化層（adapter/out/persistence）
//     ↓ 依存(実装)
// アプリケーション層のポート（application/port/out）(ここ)
//     ↑ 依存
// アプリケーション層のサービス（application/service）
//     ↓ 依存
// ドメイン層のエンティティ（application/domain/model）

/**
 * アカウントをロードするための出力ポート
 * 永続化アダプターが実装する
 */
export interface LoadAccountPort {
    /**
     * アカウントIDと基準日を指定してアカウントをロード
     *
     * @param accountId ロードするアカウントのID
     * @param baselineDate 基準日（この日付以降のアクティビティをロード）
     * @returns アカウントエンティティ
     */
    loadAccount(accountId: AccountId, baselineDate: Date): Promise<Account>;
}

/**
 * DI用のシンボル
 */
export const LoadAccountPortToken = Symbol('LoadAccountPort');
