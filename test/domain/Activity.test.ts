
import { describe, it, expect } from "vitest";
import {AccountId, Activity, ActivityId} from "../../src/account/application/domain/model/Activity";
import {Money} from "../../src/account/application/domain/model/Money";


describe("ActivityId", () => {
    it("bigint値からActivityIdを生成できる", () => {
        // Arrange & Act
        const id = new ActivityId(123n);

        // Assert
        expect(id.getValue()).toBe(123n);
    });

    it("等価性を正しく判定できる", () => {
        // Arrange
        const id1 = new ActivityId(123n);
        const id2 = new ActivityId(123n);
        const id3 = new ActivityId(456n);

        // Act & Assert
        expect(id1.equals(id2)).toBe(true);
        expect(id1.equals(id3)).toBe(false);
    });

    it("toString()で文字列に変換できる", () => {
        // Arrange
        const id = new ActivityId(123n);

        // Act & Assert
        expect(id.toString()).toBe("123");
    });
});

describe("AccountId", () => {
    it("bigint値からAccountIdを生成できる", () => {
        // Arrange & Act
        const id = new AccountId(456n);

        // Assert
        expect(id.getValue()).toBe(456n);
    });

    it("等価性を正しく判定できる", () => {
        // Arrange
        const id1 = new AccountId(456n);
        const id2 = new AccountId(456n);
        const id3 = new AccountId(789n);

        // Act & Assert
        expect(id1.equals(id2)).toBe(true);
        expect(id1.equals(id3)).toBe(false);
    });

    it("toString()で文字列に変換できる", () => {
        // Arrange
        const id = new AccountId(456n);

        // Act & Assert
        expect(id.toString()).toBe("456");
    });
});

describe("Activity", () => {
    const ownerAccountId = new AccountId(1n);
    const sourceAccountId = new AccountId(2n);
    const targetAccountId = new AccountId(3n);
    const timestamp = new Date("2025-01-01T00:00:00Z");
    const money = Money.of(100);

    it("IDなしでActivityを生成できる（新規作成時）", () => {
        // Arrange & Act
        const activity = Activity.withoutId(
            ownerAccountId,
            sourceAccountId,
            targetAccountId,
            timestamp,
            money
        );

        // Assert
        expect(activity.getId()).toBeNull();
        expect(activity.getOwnerAccountId()).toBe(ownerAccountId);
        expect(activity.getSourceAccountId()).toBe(sourceAccountId);
        expect(activity.getTargetAccountId()).toBe(targetAccountId);
        expect(activity.getTimestamp()).toBe(timestamp);
        expect(activity.getMoney()).toBe(money);
    });

    it("IDありでActivityを生成できる（DB再構成時）", () => {
        // Arrange
        const activityId = new ActivityId(999n);

        // Act
        const activity = Activity.withId(
            activityId,
            ownerAccountId,
            sourceAccountId,
            targetAccountId,
            timestamp,
            money
        );

        // Assert
        expect(activity.getId()).toBe(activityId);
        expect(activity.getOwnerAccountId()).toBe(ownerAccountId);
        expect(activity.getSourceAccountId()).toBe(sourceAccountId);
        expect(activity.getTargetAccountId()).toBe(targetAccountId);
        expect(activity.getTimestamp()).toBe(timestamp);
        expect(activity.getMoney()).toBe(money);
    });
});