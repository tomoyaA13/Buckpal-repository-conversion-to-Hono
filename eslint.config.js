// eslint.config.js
import {defineConfig} from 'eslint/config';
import honoConfig from '@hono/eslint-config';
import importPlugin from 'eslint-plugin-import';

export default defineConfig([
    // ========================================
    // 1. Honoの推奨設定を読み込む
    // ========================================
    ...honoConfig,

    // ========================================
    // 2. チェックしないファイルを指定
    // ========================================
    {
        ignores: [
            'node_modules/**',
            '.wrangler/**',
            'dist/**',
            'docs/**',
            '*.config.js',
            '*.config.ts',
            'supabase/**'
        ]
    },

    // ========================================
    // 3. TypeScript型チェックの設定
    // （@hono/eslint-configの型認識ルールを動作させるために必要）
    // ========================================
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                // tsconfig.jsonを使って型情報を取得
                project: './tsconfig.json',
                // tsconfig.jsonの基準ディレクトリ
                tsconfigRootDir: import.meta.dirname
            }
        }
    },

    // ========================================
    // 4. ヘキサゴナルアーキテクチャの境界ルール
    // ========================================
    {
        files: ['src/**/*.ts'],
        plugins: {
            import: importPlugin
        },
        settings: {
            'import/resolver': {
                typescript: {
                    project: './tsconfig.json'
                }
            }
        },
        rules: {
            // ========================================
            // アーキテクチャの境界を維持するルール
            // ========================================

            'import/no-restricted-paths': ['error', {
                zones: [
                    // ルール1: ドメイン層の完全な隔離
                    {
                        target: './src/application/domain',
                        from: './src/adapter',
                        message: '❌ ドメイン層はアダプタ層に依存できません。ドメイン層は最も内側の層で、外側の層に依存してはいけません。'
                    },
                    {
                        target: './src/application/domain',
                        from: './src/application/service',
                        message: '❌ ドメイン層はサービス層に依存できません。ドメイン層は純粋なビジネスロジックのみを含み、他の層に依存しません。'
                    },
                    {
                        target: './src/application/domain',
                        from: './src/application/port',
                        message: '❌ ドメイン層はポート層に依存できません。ポートはドメインを使う側であり、ドメインはポートを知りません。'
                    },
                    {
                        target: './src/application/domain',
                        from: './src/config',
                        message: '❌ ドメイン層は設定層に依存できません。ドメインロジックは設定に依存しない純粋な関数であるべきです。'
                    },

                    // ルール2: ポート層の制限
                    {
                        target: './src/application/port',
                        from: './src/adapter',
                        message: '❌ ポート層はアダプタ層に依存できません。ポートはインターフェースを定義する層で、実装（アダプタ）には依存しません。'
                    },
                    {
                        target: './src/application/port',
                        from: './src/application/service',
                        message: '❌ ポート層はサービス層に依存できません。ポートはサービスから使われる側であり、サービスを知りません。'
                    },
                    {
                        target: './src/application/port',
                        from: './src/config',
                        message: '❌ ポート層は設定層に依存できません。ポートは純粋なインターフェース定義であるべきです。'
                    },

                    // ルール3: サービス層の制限
                    {
                        target: './src/application/service',
                        from: './src/adapter',
                        message: '❌ サービス層はアダプタ層に依存できません。サービスはポート経由でアダプタとやり取りします。'
                    },
                    {
                        target: './src/application/service',
                        from: './src/config',
                        message: '❌ サービス層は設定層に直接依存できません。設定はDIコンテナ経由で注入してください。'
                    },

                    // ルール4: アダプタ間の依存禁止
                    {
                        target: './src/adapter/in',
                        from: './src/adapter/out',
                        message: '❌ 入力アダプタは出力アダプタに直接依存できません。アダプタ同士は独立しており、サービス層を経由して通信します。'
                    },
                    {
                        target: './src/adapter/out',
                        from: './src/adapter/in',
                        message: '❌ 出力アダプタは入力アダプタに依存できません。アダプタ同士は独立しており、サービス層を経由して通信します。'
                    },

                    // ルール5: アダプタはサービスに直接依存できない（ポート経由のみ）
                    {
                        target: './src/adapter',
                        from: './src/application/service',
                        message: '❌ アダプタはサービス実装に直接依存できません。ポート（インターフェース）経由でアクセスしてください。'
                    }
                ]
            }],

            // 循環依存の禁止
            'import/no-cycle': ['error', {
                maxDepth: 10,
                ignoreExternal: true
            }],

            // 自己インポートの禁止
            'import/no-self-import': 'error'
        }
    }
]);