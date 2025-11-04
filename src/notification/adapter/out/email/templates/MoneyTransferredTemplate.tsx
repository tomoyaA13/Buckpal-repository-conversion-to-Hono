import * as React from 'react'

interface MoneyTransferredTemplateProps {
    sourceAccountId: string
    targetAccountId: string
    amount: string
}

/**
 * 送金完了メールのテンプレート
 *
 * React コンポーネントとして定義し、
 * Resend がHTMLに変換してメールを送信する
 */
export function MoneyTransferredTemplate({
                                             sourceAccountId,
                                             targetAccountId,
                                             amount,
                                         }: MoneyTransferredTemplateProps) {
    return (
        <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px' }}>
            <h1 style={{ color: '#333' }}>送金が完了しました</h1>
            <p>以下の送金が正常に処理されました：</p>
            <div style={{ backgroundColor: '#f5f5f5', padding: '15px', borderRadius: '5px' }}>
                <p><strong>送金元口座:</strong> {sourceAccountId}</p>
                <p><strong>送金先口座:</strong> {targetAccountId}</p>
                <p><strong>金額:</strong> ¥{Number(amount).toLocaleString()}</p>
            </div>
            <p style={{ marginTop: '20px', color: '#666' }}>
                ご利用ありがとうございました。
            </p>
            <hr style={{ marginTop: '30px', borderColor: '#eee' }} />
            <p style={{ fontSize: '12px', color: '#999' }}>
                このメールは自動送信されています。
            </p>
        </div>
    )
}