import { describe, it, expect } from 'vitest';
import { Money } from '../Money';

describe('Money', () => {
    it('正の金額でMoneyを作成できる', () => {
        const money = Money.of(100);
        expect(money.getAmount()).toBe(100n);
    });
});