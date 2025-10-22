import type {SendMoneyCommand} from './SendMoneyCommand';

/**
 * 送金ユースケースのインターフェース（入力ポート）
 * ドメインサービスが実装する
 */

// 「私に送金をしてほしいなら、SendMoneyCommand という形式でデータを渡して、sendMoney メソッドを呼んでください。
// そうすれば、外側からの要求を私が処理しますよ」と言っているようなもの。
// つまり、この SendMoneyUseCase インターフェースは、アプリケーションコアとアダプター層の境界線
export interface SendMoneyUseCase {
    /**
     * 送金を実行
     *
     * @param command 送金コマンド
     * @returns 送金が成功したかどうか
     */
    sendMoney(command: SendMoneyCommand): Promise<boolean>;
}

/**
 * DI用のシンボル
 */
export const SendMoneyUseCaseToken = Symbol('SendMoneyUseCase');
