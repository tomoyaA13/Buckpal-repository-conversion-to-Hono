-- ドメインイベントストア用テーブル
-- 発生した全てのドメインイベントを時系列順に記録

-- domain_eventsテーブルの作成
CREATE TABLE IF NOT EXISTS domain_events (
    -- イベントID（主キー）
    -- UUIDを使用して、グローバルに一意な識別子を確保
                                             event_id UUID PRIMARY KEY,

    -- イベントタイプ
    -- 例: 'MoneyTransferred', 'AccountCreated'
    -- インデックスを張って検索を高速化
                                             event_type VARCHAR(255) NOT NULL,

    -- イベント発生日時
    -- 時系列分析やイベントのリプレイに使用
    occurred_on TIMESTAMPTZ NOT NULL,

    -- イベントデータ（JSON形式）
    -- イベントの全情報をJSONBで保存
    -- JSONBは検索・インデックス作成が可能
    event_data JSONB NOT NULL,

    -- 作成日時（監査用）
    -- イベントが実際にデータベースに保存された時刻
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );

-- インデックス: イベントタイプで高速検索
CREATE INDEX IF NOT EXISTS idx_domain_events_event_type
    ON domain_events(event_type);

-- インデックス: 発生日時で高速検索（時系列分析用）
CREATE INDEX IF NOT EXISTS idx_domain_events_occurred_on
    ON domain_events(occurred_on DESC);

-- 複合インデックス: イベントタイプ + 発生日時
-- 「特定のイベントタイプを期間指定で検索」を高速化
CREATE INDEX IF NOT EXISTS idx_domain_events_type_occurred
    ON domain_events(event_type, occurred_on DESC);

-- コメント追加
COMMENT ON TABLE domain_events IS 'ドメインイベントストア - 全てのドメインイベントを時系列順に記録';
COMMENT ON COLUMN domain_events.event_id IS 'イベントの一意識別子（UUID）';
COMMENT ON COLUMN domain_events.event_type IS 'イベントタイプ（例: MoneyTransferred）';
COMMENT ON COLUMN domain_events.occurred_on IS 'イベント発生日時';
COMMENT ON COLUMN domain_events.event_data IS 'イベントの詳細データ（JSON形式）';
COMMENT ON COLUMN domain_events.created_at IS 'データベース登録日時（監査用）';