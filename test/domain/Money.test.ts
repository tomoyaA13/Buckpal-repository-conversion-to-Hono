import { describe, it, expect } from "vitest";
import {Money} from "../../src/account/application/domain/model/Money";


describe("Money", () => {
    // ===== 基本的な生成と取得 =====

    it("Moneyオブジェクトを数値から生成できる", () => {
        // Arrange & Act
        const money = Money.of(100);

        // Assert
        expect(money.getAmount()).toBe(100n);
    });

    it("Moneyオブジェクトをbigintから生成できる", () => {
        // Arrange & Act
        const money = Money.of(100n);

        // Assert
        expect(money.getAmount()).toBe(100n);
    });

    it("ZERO定数が正しく定義されている", () => {
        // Act & Assert
        expect(Money.ZERO.getAmount()).toBe(0n);
    });

    // ===== 加算と減算 =====

    it("2つのMoneyを加算できる", () => {
        // Arrange
        const money1 = Money.of(100);
        const money2 = Money.of(50);

        // Act
        const result = money1.plus(money2);

        // Assert
        expect(result.getAmount()).toBe(150n);
    });

    it("2つのMoneyを減算できる", () => {
        // Arrange
        const money1 = Money.of(100);
        const money2 = Money.of(30);

        // Act
        const result = money1.minus(money2);

        // Assert
        expect(result.getAmount()).toBe(70n);
    });

    it("静的メソッドaddで加算できる", () => {
        // Arrange
        const money1 = Money.of(100);
        const money2 = Money.of(50);

        // Act
        const result = Money.add(money1, money2);

        // Assert
        expect(result.getAmount()).toBe(150n);
    });

    it("静的メソッドsubtractで減算できる", () => {
        // Arrange
        const money1 = Money.of(100);
        const money2 = Money.of(30);

        // Act
        const result = Money.subtract(money1, money2);

        // Assert
        expect(result.getAmount()).toBe(70n);
    });

    // ===== 符号反転 =====

    it("符号を反転できる", () => {
        // Arrange
        const money = Money.of(100);

        // Act
        const negated = money.negate();

        // Assert
        expect(negated.getAmount()).toBe(-100n);
    });

    it("負の値を反転すると正になる", () => {
        // Arrange
        const money = Money.of(-100);

        // Act
        const negated = money.negate();

        // Assert
        expect(negated.getAmount()).toBe(100n);
    });

    // ===== 判定メソッド =====

    it("正の値を正しく判定できる", () => {
        // Arrange & Act & Assert
        expect(Money.of(100).isPositive()).toBe(true);
        expect(Money.of(0).isPositive()).toBe(false);
        expect(Money.of(-100).isPositive()).toBe(false);
    });

    it("0または正の値を正しく判定できる", () => {
        // Arrange & Act & Assert
        expect(Money.of(100).isPositiveOrZero()).toBe(true);
        expect(Money.of(0).isPositiveOrZero()).toBe(true);
        expect(Money.of(-100).isPositiveOrZero()).toBe(false);
    });

    it("負の値を正しく判定できる", () => {
        // Arrange & Act & Assert
        expect(Money.of(100).isNegative()).toBe(false);
        expect(Money.of(0).isNegative()).toBe(false);
        expect(Money.of(-100).isNegative()).toBe(true);
    });

    // ===== 比較 =====

    it("他のMoneyより大きいか判定できる", () => {
        // Arrange
        const larger = Money.of(100);
        const smaller = Money.of(50);

        // Act & Assert
        expect(larger.isGreaterThan(smaller)).toBe(true);
        expect(smaller.isGreaterThan(larger)).toBe(false);
    });

    it("他のMoney以上か判定できる", () => {
        // Arrange
        const money1 = Money.of(100);
        const money2 = Money.of(100);
        const smaller = Money.of(50);

        // Act & Assert
        expect(money1.isGreaterThanOrEqualTo(money2)).toBe(true);
        expect(money1.isGreaterThanOrEqualTo(smaller)).toBe(true);
        expect(smaller.isGreaterThanOrEqualTo(money1)).toBe(false);
    });

    // ===== 等価性 =====

    it("等価なMoneyを正しく判定できる", () => {
        // Arrange
        const money1 = Money.of(100);
        const money2 = Money.of(100);
        const money3 = Money.of(200);

        // Act & Assert
        expect(money1.equals(money2)).toBe(true);
        expect(money1.equals(money3)).toBe(false);
    });

    // ===== 不変性（Immutability）のテスト =====

    it("plusメソッドは元のオブジェクトを変更しない", () => {
        // Arrange
        const original = Money.of(100);
        const originalAmount = original.getAmount();

        // Act
        original.plus(Money.of(50));

        // Assert: 元のオブジェクトは変更されていない
        expect(original.getAmount()).toBe(originalAmount);
    });

    it("minusメソッドは元のオブジェクトを変更しない", () => {
        // Arrange
        const original = Money.of(100);
        const originalAmount = original.getAmount();

        // Act
        original.minus(Money.of(50));

        // Assert: 元のオブジェクトは変更されていない
        expect(original.getAmount()).toBe(originalAmount);
    });

    it("negateメソッドは元のオブジェクトを変更しない", () => {
        // Arrange
        const original = Money.of(100);
        const originalAmount = original.getAmount();

        // Act
        original.negate();

        // Assert: 元のオブジェクトは変更されていない
        expect(original.getAmount()).toBe(originalAmount);
    });

    // ===== 文字列変換 =====

    it("toString()で文字列に変換できる", () => {
        // Arrange
        const money = Money.of(100);

        // Act
        const str = money.toString();

        // Assert
        expect(str).toBe("100");
    });
});