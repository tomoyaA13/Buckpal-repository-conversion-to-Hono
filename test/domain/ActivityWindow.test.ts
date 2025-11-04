import { describe, it, expect } from "vitest";
import {AccountId, Activity} from "../../src/application/domain/model/Activity";
import {ActivityWindow} from "../../src/application/domain/model/ActivityWindow";
import {Money} from "../../src/application/domain/model/Money";


describe("ActivityWindow", () => {
    const accountId1 = new AccountId(1n);
    const accountId2 = new AccountId(2n);

    it("空のActivityWindowを作成できる", () => {
        // Arrange & Act
        const window = new ActivityWindow();

        // Assert
        expect(window.getActivities()).toHaveLength(0);
    });

    it("複数のアクティビティでActivityWindowを作成できる", () => {
        // Arrange
        const activity1 = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            new Date("2025-01-01"),
            Money.of(100)
        );
        const activity2 = Activity.withoutId(
            accountId1,
            accountId2,
            accountId1,
            new Date("2025-01-02"),
            Money.of(50)
        );

        // Act
        const window = new ActivityWindow(activity1, activity2);

        // Assert
        expect(window.getActivities()).toHaveLength(2);
    });

    it("アクティビティを追加できる", () => {
        // Arrange
        const window = new ActivityWindow();
        const activity = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            new Date("2025-01-01"),
            Money.of(100)
        );

        // Act
        window.addActivity(activity);

        // Assert
        expect(window.getActivities()).toHaveLength(1);
        expect(window.getActivities()[0]).toBe(activity);
    });

    it("最初のタイムスタンプを取得できる", () => {
        // Arrange
        const date1 = new Date("2025-01-03");
        const date2 = new Date("2025-01-01");
        const date3 = new Date("2025-01-02");

        const activity1 = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            date1,
            Money.of(100)
        );
        const activity2 = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            date2,
            Money.of(50)
        );
        const activity3 = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            date3,
            Money.of(75)
        );

        const window = new ActivityWindow(activity1, activity2, activity3);

        // Act
        const startTimestamp = window.getStartTimestamp();

        // Assert
        expect(startTimestamp).toEqual(date2); // 2025-01-01が最も古い
    });

    it("最後のタイムスタンプを取得できる", () => {
        // Arrange
        const date1 = new Date("2025-01-03");
        const date2 = new Date("2025-01-01");
        const date3 = new Date("2025-01-02");

        const activity1 = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            date1,
            Money.of(100)
        );
        const activity2 = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            date2,
            Money.of(50)
        );
        const activity3 = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            date3,
            Money.of(75)
        );

        const window = new ActivityWindow(activity1, activity2, activity3);

        // Act
        const endTimestamp = window.getEndTimestamp();

        // Assert
        expect(endTimestamp).toEqual(date1); // 2025-01-03が最も新しい
    });

    it("空のウィンドウでgetStartTimestamp()を呼ぶとエラー", () => {
        // Arrange
        const window = new ActivityWindow();

        // Act & Assert
        expect(() => window.getStartTimestamp()).toThrow("ActivityWindow is empty");
    });

    it("空のウィンドウでgetEndTimestamp()を呼ぶとエラー", () => {
        // Arrange
        const window = new ActivityWindow();

        // Act & Assert
        expect(() => window.getEndTimestamp()).toThrow("ActivityWindow is empty");
    });

    it("指定アカウントの残高を計算できる（入金のみ）", () => {
        // Arrange: accountId1への入金が2回
        const activity1 = Activity.withoutId(
            accountId1,
            accountId2, // source
            accountId1, // target = 入金
            new Date(),
            Money.of(100)
        );
        const activity2 = Activity.withoutId(
            accountId1,
            accountId2,
            accountId1,
            new Date(),
            Money.of(50)
        );

        const window = new ActivityWindow(activity1, activity2);

        // Act
        const balance = window.calculateBalance(accountId1);

        // Assert
        expect(balance.getAmount()).toBe(150n); // 100 + 50
    });

    it("指定アカウントの残高を計算できる（出金のみ）", () => {
        // Arrange: accountId1からの出金が2回
        const activity1 = Activity.withoutId(
            accountId1,
            accountId1, // source = 出金
            accountId2, // target
            new Date(),
            Money.of(100)
        );
        const activity2 = Activity.withoutId(
            accountId1,
            accountId1,
            accountId2,
            new Date(),
            Money.of(50)
        );

        const window = new ActivityWindow(activity1, activity2);

        // Act
        const balance = window.calculateBalance(accountId1);

        // Assert
        expect(balance.getAmount()).toBe(-150n); // -(100 + 50)
    });

    it("指定アカウントの残高を計算できる（入金と出金の混在）", () => {
        // Arrange
        const deposit1 = Activity.withoutId(
            accountId1,
            accountId2,
            accountId1, // 入金
            new Date(),
            Money.of(100)
        );
        const withdrawal1 = Activity.withoutId(
            accountId1,
            accountId1, // 出金
            accountId2,
            new Date(),
            Money.of(30)
        );
        const deposit2 = Activity.withoutId(
            accountId1,
            accountId2,
            accountId1, // 入金
            new Date(),
            Money.of(50)
        );

        const window = new ActivityWindow(deposit1, withdrawal1, deposit2);

        // Act
        const balance = window.calculateBalance(accountId1);

        // Assert
        expect(balance.getAmount()).toBe(120n); // (100 + 50) - 30 = 120
    });
});