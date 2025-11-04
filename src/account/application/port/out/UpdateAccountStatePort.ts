import type {Account} from '../../domain/model/Account';

// 依存関係の向き(永続化層がアプリケーション層に依存する)
// 永続化層（adapter/out/persistence）
//     ↓ 依存(実装)
// アプリケーション層のポート（application/port/out）(ここ)
//     ↑ 依存
// アプリケーション層のサービス（application/service）
//     ↓ 依存
// ドメイン層のエンティティ（application/domain/model）

/**
 * アカウント状態を更新するための出力ポート
 * 永続化アダプターが実装する
 */
export interface UpdateAccountStatePort {
    /**
     * アカウントのアクティビティを更新
     * 新しいアクティビティのみをDBに保存
     *
     * @param account 更新するアカウント
     */
    updateActivities(account: Account): Promise<void>;
}

/**
 * DI用のシンボル
 */
export const UpdateAccountStatePortToken = Symbol('UpdateAccountStatePort');
