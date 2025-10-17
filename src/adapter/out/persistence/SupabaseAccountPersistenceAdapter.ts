import {injectable} from 'tsyringe';
import {createClient, SupabaseClient} from '@supabase/supabase-js';
import {LoadAccountPort} from '../../../application/port/out/LoadAccountPort';
import {UpdateAccountStatePort} from '../../../application/port/out/UpdateAccountStatePort';
import {Account} from '../../../application/domain/model/Account';
import {AccountId, Activity, ActivityId} from '../../../application/domain/model/Activity';
import {ActivityWindow} from '../../../application/domain/model/ActivityWindow';
import {Money} from '../../../application/domain/model/Money';
import {Database} from "../../../../supabase/database";

/**
 * Supabaseを使用したアカウント永続化アダプター
 */
@injectable()
export class SupabaseAccountPersistenceAdapter
    implements LoadAccountPort, UpdateAccountStatePort {
    private supabase: SupabaseClient<Database>;

    constructor(supabaseUrl: string, supabaseKey: string) {
        this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
    }

    // 残りの実装は前回と同じ
    async loadAccount(accountId: AccountId, baselineDate: Date): Promise<Account> {
        // アカウントの存在確認
        const {data: accountData, error: accountError} = await this.supabase
            .from('accounts')
            .select('id')
            .eq('id', accountId.getValue().toString())
            .single();

        if (accountError || !accountData) {
            throw new Error(`Account not found: ${accountId.getValue()}`);
        }

        // baselineDate以降のアクティビティを取得
        const {data: activitiesAfterBaseline, error: activitiesError} = await this.supabase
            .from('activities')
            .select('*')
            .eq('owner_account_id', accountId.getValue().toString())
            .gte('timestamp', baselineDate.toISOString())
            .order('timestamp', {ascending: true});

        if (activitiesError) {
            throw new Error(`Failed to load activities: ${activitiesError.message}`);
        }

        // baselineDate以前の出金額を計算
        const {data: withdrawals, error: withdrawalError} = await this.supabase
            .from('activities')
            .select('amount')
            .eq('source_account_id', accountId.getValue().toString())
            .eq('owner_account_id', accountId.getValue().toString())
            .lt('timestamp', baselineDate.toISOString());

        if (withdrawalError) {
            throw new Error(`Failed to calculate withdrawals: ${withdrawalError.message}`);
        }

        const withdrawalBalance = (withdrawals || []).reduce(
            (sum, a) => sum + BigInt(a.amount),
            0n
        );

        // baselineDate以前の入金額を計算
        const {data: deposits, error: depositError} = await this.supabase
            .from('activities')
            .select('amount')
            .eq('target_account_id', accountId.getValue().toString())
            .eq('owner_account_id', accountId.getValue().toString())
            .lt('timestamp', baselineDate.toISOString());

        if (depositError) {
            throw new Error(`Failed to calculate deposits: ${depositError.message}`);
        }

        const depositBalance = (deposits || []).reduce(
            (sum, a) => sum + BigInt(a.amount),
            0n
        );

        const baselineBalance = Money.subtract(
            Money.of(depositBalance),
            Money.of(withdrawalBalance)
        );

        // アクティビティをドメインモデルに変換
        const activities = (activitiesAfterBaseline || []).map((a) =>
            Activity.withId(
                new ActivityId(BigInt(a.id)),
                new AccountId(BigInt(a.owner_account_id)),
                new AccountId(BigInt(a.source_account_id)),
                new AccountId(BigInt(a.target_account_id)),
                new Date(a.timestamp),
                Money.of(BigInt(a.amount))
            )
        );

        return Account.withId(
            accountId,
            baselineBalance,
            new ActivityWindow(...activities)
        );
    }

    async updateActivities(account: Account): Promise<void> {
        const newActivities = account
            .getActivityWindow()
            .getActivities()
            .filter((activity) => !activity.getId());

        if (newActivities.length === 0) {
            return;
        }

        const activityRecords = newActivities.map((activity) => ({
            timestamp: activity.getTimestamp().toISOString(),
            owner_account_id: activity.getOwnerAccountId().getValue().toString(),
            source_account_id: activity.getSourceAccountId().getValue().toString(),
            target_account_id: activity.getTargetAccountId().getValue().toString(),
            amount: activity.getMoney().getAmount().toString(),
        }));

        const {error} = await this.supabase
            .from('activities')
            .insert(activityRecords);

        if (error) {
            throw new Error(`Failed to insert activities: ${error.message}`);
        }
    }

}