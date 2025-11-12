import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ResendEmailAdapter} from '../../../../../src/notification/adapter/out/email/ResendEmailAdapter'

/**
 * ResendEmailAdapter のテスト
 *
 * 【テスト戦略】
 * - Resend API をモック化して、実際のメール送信を行わない
 * - 正しいパラメータで API が呼ばれることを検証
 * - エラーハンドリングをテスト
 */

// モック関数を作成
const mockSend = vi.fn()

// Resend モジュール全体をモック化
vi.mock('resend', () => {
    return {
        Resend: vi.fn().mockImplementation(() => ({
            emails: {
                send: mockSend,
            },
        })),
    }
})

describe('ResendEmailAdapter', () => {
    let adapter: ResendEmailAdapter

    beforeEach(() => {
        // モックをリセット
        vi.clearAllMocks()

        // アダプターのインスタンスを作成
        adapter = new ResendEmailAdapter('test-api-key')
    })

    describe('sendMoneyTransferNotification - 正常系', () => {
        it('正しいパラメータでメール送信 API を呼び出すこと', async () => {
            // Given: Resend API が成功を返すようにモック
            mockSend.mockResolvedValueOnce({
                data: {id: 'test-email-id'},
                error: null,
            })

            // When: メール送信を実行
            await adapter.sendMoneyTransferNotification(
                'test@example.com',
                'ACC-001',
                'ACC-002',
                '10000'
            )

            // Then: 正しいパラメータで API が呼ばれること
            expect(mockSend).toHaveBeenCalledTimes(1)
            expect(mockSend).toHaveBeenCalledWith({
                from: 'Buckpal <onboarding@resend.dev>',
                to: 'alligatorfree12@gmail.com', // 現在はハードコードされている
                subject: '送金が完了しました',
                html: expect.stringContaining('送金が完了しました'), // HTML が生成されていること
            })
        })

        it('HTML コンテンツに送金情報が含まれていること', async () => {
            // Given
            mockSend.mockResolvedValueOnce({
                data: {id: 'test-email-id'},
                error: null,
            })

            // When
            await adapter.sendMoneyTransferNotification(
                'test@example.com',
                'ACC-001',
                'ACC-002',
                '10000'
            )

            // Then: HTML に送金情報が含まれていることを確認
            const callArgs = mockSend.mock.calls[0][0]
            const htmlContent = callArgs.html

            expect(htmlContent).toContain('ACC-001') // 送金元口座ID
            expect(htmlContent).toContain('ACC-002') // 送金先口座ID
            expect(htmlContent).toContain('10,000') // フォーマットされた金額
        })

        it('金額がカンマ区切りでフォーマットされること', async () => {
            // Given
            mockSend.mockResolvedValueOnce({
                data: {id: 'test-email-id'},
                error: null,
            })

            // When: 大きな金額でテスト
            await adapter.sendMoneyTransferNotification(
                'test@example.com',
                'ACC-001',
                'ACC-002',
                '1234567'
            )

            // Then: カンマ区切りで表示されること
            const callArgs = mockSend.mock.calls[0][0]
            const htmlContent = callArgs.html

            expect(htmlContent).toContain('1,234,567')
        })
    })

    describe('sendMoneyTransferNotification - 異常系', () => {
        it('Resend API がエラーを返した場合、例外をスローすること', async () => {
            // Given: Resend API がエラーを返すようにモック
            const mockError = {message: 'API rate limit exceeded'}
            mockSend.mockResolvedValueOnce({
                data: null,
                error: mockError,
            })

            // When & Then: 例外がスローされること
            await expect(
                adapter.sendMoneyTransferNotification(
                    'test@example.com',
                    'ACC-001',
                    'ACC-002',
                    '10000'
                )
            ).rejects.toThrow('Email sending failed: API rate limit exceeded')
        })

        it('Resend API が予期しないエラーをスローした場合、例外が伝播すること', async () => {
            // Given: Resend API が予期しないエラーをスロー
            const unexpectedError = new Error('Network error')
            mockSend.mockRejectedValueOnce(unexpectedError)

            // When & Then: 例外が伝播すること
            await expect(
                adapter.sendMoneyTransferNotification(
                    'test@example.com',
                    'ACC-001',
                    'ACC-002',
                    '10000'
                )
            ).rejects.toThrow('Network error')
        })
    })
})