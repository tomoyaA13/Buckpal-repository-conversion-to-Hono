import { inject, injectable } from 'tsyringe';
import { LoadAccountPort } from '../../../application/port/out/LoadAccountPort';
import { UpdateAccountStatePort } from '../../../application/port/out/UpdateAccountStatePort';
import { Account } from '../../../application/domain/model/Account';
import { AccountId } from '../../../application/domain/model/Activity';
import { SupabaseClientToken, TypedSupabaseClient } from '../../../config/types';
import { AccountMapper } from './mappers/AccountMapper';
import { AccountAggregateEntity } from './entities/AccountEntity';
import { PersistedActivityEntity } from './entities/ActivityEntity';

/**
 * Supabaseを使用したアカウント永続化アダプター（双方向モデル変換版）
 * 
 * 永続化層の責務：
 * 1. DBからデータを取得
 * 2. DBエンティティをドメインモデルに変換（Mapper使用）
 * 3. ドメインモデルからDBエンティティに変換（Mapper使用）
 * 4. DBにデータを保存
 */
@injectable()
export class SupabaseAccountPersistenceAdapter
  implements LoadAccountPort, UpdateAccountStatePort {

  constructor(
    @inject(SupabaseClientToken) private readonly supabase: TypedSupabaseClient
  ) {
    console.log('✅ SupabaseAccountPersistenceAdapter initialized (with model mapping)');
  }

  /**
   * アカウントを読み込む
   * 
   * 処理の流れ：
   * 1. DBからアカウントとアクティビティを取得
   * 2. エンティティに変換
   * 3. Mapperでドメインモデルに変換
   */
  async loadAccount(accountId: AccountId, baselineDate: Date): Promise<Account> {
    const accountIdNum = Number(accountId.getValue());

    // 1. アカウントの存在確認
    const { data: accountData, error: accountError } = await this.supabase
      .from('accounts')
      .select('id')
      .eq('id', accountIdNum)
      .single();

    if (accountError || !accountData) {
      throw new Error(`Account not found: ${accountId.getValue()}`);
    }

    // 2. baselineDate以降のアクティビティを取得
    const { data: activitiesAfterBaseline, error: activitiesError } = await this.supabase
      .from('activities')
      .select('*')
      .eq('owner_account_id', accountIdNum)
      .gte('timestamp', baselineDate.toISOString())
      .order('timestamp', { ascending: true });

    if (activitiesError) {
      throw new Error(`Failed to load activities: ${activitiesError.message}`);
    }

    // 3. baselineDate以前のアクティビティを取得（残高計算用）
    const { data: activitiesBeforeBaseline, error: beforeBaselineError } = await this.supabase
      .from('activities')
      .select('*')
      .eq('owner_account_id', accountIdNum)
      .lt('timestamp', baselineDate.toISOString());

    if (beforeBaselineError) {
      throw new Error(
        `Failed to load activities before baseline: ${beforeBaselineError.message}`
      );
    }

    // 4. エンティティを作成
    const persistedActivitiesAfter: PersistedActivityEntity[] = (
      activitiesAfterBaseline || []
    ).map((a) => ({
      id: a.id,
      timestamp: a.timestamp,
      owner_account_id: a.owner_account_id,
      source_account_id: a.source_account_id,
      target_account_id: a.target_account_id,
      amount: a.amount,
    }));

    const persistedActivitiesBefore: PersistedActivityEntity[] = (
      activitiesBeforeBaseline || []
    ).map((a) => ({
      id: a.id,
      timestamp: a.timestamp,
      owner_account_id: a.owner_account_id,
      source_account_id: a.source_account_id,
      target_account_id: a.target_account_id,
      amount: a.amount,
    }));

    // 5. ベースライン残高を計算
    const baselineBalance = AccountMapper.calculateBaselineBalance(
      persistedActivitiesBefore,
      accountIdNum
    );

    // 6. 集約エンティティを作成
    const aggregate: AccountAggregateEntity = {
      account: { id: accountIdNum },
      activities: persistedActivitiesAfter,
      baselineBalance: Number(baselineBalance),
    };

    // 7. Mapperを使ってドメインモデルに変換
    return AccountMapper.toDomain(aggregate);
  }

  /**
   * アクティビティを更新（新規アクティビティを保存）
   * 
   * 処理の流れ：
   * 1. ドメインモデルから新規アクティビティを抽出
   * 2. Mapperでエンティティに変換
   * 3. DBに挿入
   */
  async updateActivities(account: Account): Promise<void> {
    // 1. Mapperでドメインモデルをエンティティに変換
    const activityEntities = AccountMapper.toActivityEntities(account);

    if (activityEntities.length === 0) {
      return; // 新規アクティビティがない場合は何もしない
    }

    // 2. DBに挿入
    const { error } = await this.supabase
      .from('activities')
      .insert(activityEntities);

    if (error) {
      throw new Error(`Failed to insert activities: ${error.message}`);
    }

    console.log(`✅ Inserted ${activityEntities.length} new activities`);
  }
}
