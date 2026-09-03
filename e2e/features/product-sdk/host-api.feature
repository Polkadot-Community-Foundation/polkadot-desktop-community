@product-sdk @allure.label.parentSuite:authenticated @allure.label.suite:host-playground @allure.label.feature:Host_API
Feature: Host API — notifications & theme

  Verify the product-sdk Host API surfaces (notifications, theme subscription)
  via the host-playground test product.

  @allure.id:14910
  Scenario: TC-11.1.1 Immediate push notification is accepted by the host
    Given the user is authenticated
    And the test product "host-playground" is opened
    And the user clicks the "Notifications" tab
    When the user runs "Push Notification"
    Then the result contains "Notification"

  @allure.id:14912
  Scenario: TC-11.1.3 Cancel a notification via the Host API
    Given the user is authenticated
    And the test product "host-playground" is opened
    And the user clicks the "Notifications" tab
    When the user runs "Cancel Notification"
    Then the result contains "Notification"

  @allure.id:14909
  Scenario: TC-10.4.1 Product receives theme updates via the Host API
    Given the user is authenticated
    And the test product "host-playground" is opened
    And the user clicks the "Theme" tab
    When the user runs "Subscribe Theme"
    Then the result contains "theme"

  @allure.id:14914
  Scenario: TC-11.1.5 Scheduling past the limit returns a schedule-limit error
    Given the user is authenticated
    And the test product "host-playground" is opened
    And the user clicks the "Notifications" tab
    When the user schedules push notifications past the limit
    # The product (product-sdk 0.19.1) surfaces the host's ScheduleLimitReached
    # rejection as a RangeError in its log once the queue cap is exceeded.
    Then the result contains "RangeError"

  @allure.id:14915
  Scenario: TC-11.2.1 Rate-limited push notifications show a toast naming the product
    Given the user is authenticated
    And the test product "host-playground" is opened
    And the user clicks the "Notifications" tab
    When the user fires a burst of push notifications
    Then a rate-limit toast names the product "host-playground"
