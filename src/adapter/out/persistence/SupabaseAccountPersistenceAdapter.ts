import {inject, injectable} from 'tsyringe';
import {Account} from '../../../application/domain/model/Account';
import {AccountId} from '../../../application/domain/model/Activity';
import {LoadAccountPort} from '../../../application/port/out/LoadAccountPort';
import {UpdateAccountStatePort} from '../../../application/port/out/UpdateAccountStatePort';
import {SupabaseClientToken, TypedSupabaseClient} from '../../../config/types';
import {AccountAggregateRecord} from './entities/AccountRecord';
import {toDomain, toActivityRecords, calculateBaselineBalance} from './mappers/AccountMapper';

/**
 * Supabaseを使用したアカウント永続化アダプター（双方向モデル変換版）
 *
 * 永続化層の責務：
 * 1. DBからデータを取得
 * 2. DBレコードをドメインモデルに変換（Mapper使用）
 * 3. ドメインモデルからDBレコードに変換（Mapper使用）
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
     * 2. Mapperでドメインモデルに変換
     *
     * 注意: Supabaseから取得したデータは Database['public']['Tables']['activities']['Row'][] 型ですが、
     * TypeScriptの構造的型付けにより PersistedActivityRecord[] として扱えます。
     * (必要なプロパティをすべて持っているため、型アサーションや変換は不要)
     */
    async loadAccount(accountId: AccountId, baselineDate: Date): Promise<Account> {
        const accountIdNum = Number(accountId.getValue());

        // 1. アカウントの存在確認
        const {error: accountError} = await this.supabase
            .from('accounts')
            .select('id')
            .eq('id', accountIdNum)
            .single();

        if (accountError) {
            throw new Error(`Account not found: ${accountId.getValue().toString()}`);
        }

        // 2. baselineDate以降のアクティビティを取得
        const {data: activitiesAfterBaseline, error: activitiesError} = await this.supabase
            .from('activities')
            .select('*')
            .eq('owner_account_id', accountIdNum)
            .gte('timestamp', baselineDate.toISOString())
            .order('timestamp', {ascending: true});

        if (activitiesError) {
            throw new Error(`Failed to load activities: ${activitiesError.message}`);
        }

        // 3. baselineDate以前のアクティビティを取得（残高計算用）
        const {data: activitiesBeforeBaseline, error: beforeBaselineError} = await this.supabase
            .from('activities')
            .select('*')
            .eq('owner_account_id', accountIdNum)
            .lt('timestamp', baselineDate.toISOString());

        if (beforeBaselineError) {
            throw new Error(
                `Failed to load activities before baseline: ${beforeBaselineError.message}`
            );
        }

        // 4. ベースライン残高を計算
        // 注意: Supabaseから取得したデータは Database['public']['Tables']['activities']['Row'][] 型
        // TypeScriptの構造的型付けにより、PersistedActivityRecord[] として扱える
        // (必要なプロパティをすべて持っているため、型アサーションや変換は不要)
        const baselineBalance = calculateBaselineBalance(
            activitiesBeforeBaseline,
            accountIdNum
        );

        // 5. 集約レコードを作成
        const accountAggregateRecord: AccountAggregateRecord = {
            account: {id: accountIdNum},
            activities: activitiesAfterBaseline,
            baselineBalance: Number(baselineBalance),
        };

        // 6. Mapperを使ってドメインモデルに変換
        return toDomain(accountAggregateRecord);
    }

    /**
     * アクティビティを更新（新規アクティビティを保存）
     *
     * 処理の流れ：
     * 1. ドメインモデルから新規アクティビティを抽出
     * 2. Mapperでレコードに変換
     * 3. DBに挿入
     */
    async updateActivities(account: Account): Promise<void> {
        // 1. Mapperでドメインモデルをレコードに変換
        const activityRecords = toActivityRecords(account);

        if (activityRecords.length === 0) {
            return; // 新規アクティビティがない場合は何もしない
        }

        // 2. DBに挿入
        const {error} = await this.supabase
            .from('activities')
            .insert(activityRecords);

        if (error) {
            throw new Error(`Failed to insert activities: ${error.message}`);
        }

        console.log(`✅ Inserted ${activityRecords.length.toString()} new activities`);
    }
}