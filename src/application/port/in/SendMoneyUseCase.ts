import { SendMoneyCommand } from './SendMoneyCommand';

/**
 * 送金ユースケースのインターフェース（入力ポート）
 * ドメインサービスが実装する
 */
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
export const SendMoneyUseCase = Symbol('SendMoneyUseCase');
