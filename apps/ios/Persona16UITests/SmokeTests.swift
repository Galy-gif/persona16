import XCTest

final class SmokeTests: XCTestCase {
  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  @MainActor
  func testAppLaunchesWithRootTabs() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-ui-testing"]
    app.launch()

    let conversationsTab = app.tabBars.buttons["对话"]
    let settingsTab = app.tabBars.buttons["设置"]

    XCTAssertTrue(conversationsTab.waitForExistence(timeout: 5))
    XCTAssertTrue(settingsTab.exists)
    XCTAssertTrue(app.navigationBars["Persona16"].exists)
  }

  @MainActor
  func testCreatesSingleCharacterRoomAndShowsComposer() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-ui-testing"]
    app.launch()

    app.tabBars.buttons["人物"].tap()
    XCTAssertTrue(app.navigationBars["人物"].waitForExistence(timeout: 5))

    app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "林衡，")
    ).firstMatch.tap()
    XCTAssertTrue(app.buttons["进入对话"].waitForExistence(timeout: 5))
    app.buttons["进入对话"].tap()

    XCTAssertTrue(app.staticTexts["房间已准备好"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.textFields.firstMatch.exists || app.textViews.firstMatch.exists)
  }

  @MainActor
  func testMemberSheetRequiresRemovalConfirmation() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-ui-testing"]
    app.launch()

    app.tabBars.buttons["人物"].tap()
    app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "林衡，")
    ).firstMatch.tap()
    XCTAssertTrue(app.buttons["进入对话"].waitForExistence(timeout: 5))
    app.buttons["进入对话"].tap()
    XCTAssertTrue(app.staticTexts["房间已准备好"].waitForExistence(timeout: 5))

    app.buttons["成员"].tap()
    XCTAssertTrue(app.navigationBars["房间成员"].waitForExistence(timeout: 5))
    app.buttons["room.members.remove.ENFP"].tap()

    XCTAssertTrue(app.buttons["确认移除夏栩"].waitForExistence(timeout: 5))
  }

  @MainActor
  func testMemoryDecisionCardIsReachableInRoom() throws {
    let app = XCUIApplication()
    app.launchArguments = ["-ui-testing"]
    app.launch()

    app.tabBars.buttons["人物"].tap()
    app.buttons.matching(
      NSPredicate(format: "label BEGINSWITH %@", "林衡，")
    ).firstMatch.tap()
    XCTAssertTrue(app.buttons["进入对话"].waitForExistence(timeout: 5))
    app.buttons["进入对话"].tap()

    XCTAssertTrue(
      app.otherElements["memory-decision-preview-memory-candidate"]
        .waitForExistence(timeout: 5)
    )
    XCTAssertTrue(app.buttons["记住"].exists)
    XCTAssertTrue(app.buttons["忽略"].exists)
  }
}
