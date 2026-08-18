@product-sdk @manual-permissions @allure.label.parentSuite:authenticated @allure.label.suite:Permissions @allure.label.feature:Alias_Permissions
Feature: Alias permissions

  A product requesting an account alias (host-playground "Get Product Account
  Alias") pops the host alias-permission dialog. The feature is tagged
  manual-permissions so the auto-approver is off and the test drives the dialog
  itself. The dialog decision is local (resolve of a confirm()), so the dialog
  closing is the deterministic outcome — the on-chain VRF alias round-trip that
  follows an approval is not asserted here.

  @allure.id:14809
  Scenario: TC-6.5.1 Approve alias access with Allow Always
    Given the user is authenticated
    And the test product "host-playground" is opened
    And the user clicks the "Accounts" tab
    When the user runs "Get Product Account Alias"
    Then the alias permission dialog is shown
    When the user approves alias access always
    Then the alias permission dialog is dismissed

  @allure.id:14810
  Scenario: TC-6.5.2 Deny and Allow Once for alias access
    Given the user is authenticated
    And the test product "host-playground" is opened
    And the user clicks the "Accounts" tab
    When the user runs "Get Product Account Alias"
    Then the alias permission dialog is shown
    When the user approves alias access once
    Then the alias permission dialog is dismissed
    When the user runs "Get Product Account Alias"
    Then the alias permission dialog is shown
    When the user denies alias access
    Then the alias permission dialog is dismissed

  @allure.id:14908
  Scenario: TC-10.3.5 Alias permission request screen renders correctly
    Given the user is authenticated
    And the test product "host-playground" is opened
    And the user clicks the "Accounts" tab
    When the user runs "Get Product Account Alias"
    Then the alias permission dialog is shown
    And the permission dialog screenshot is taken as "alias-permission-request"
