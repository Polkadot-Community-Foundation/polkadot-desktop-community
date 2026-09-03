@auth @allure.label.parentSuite:auth @allure.label.suite:Session_Identity
Feature: Session, Connection State & Storage Migration

  These auth-project scenarios run a fresh Electron in autotest mode but do NOT
  pair (no signing bot needed). They cover the pre-sign-in connection badge and
  the boot-time storage migrations.

  @allure.label.feature:Connection_State @allure.id:14702
  Scenario: TC-2.4.3 No-connection state shown before sign-in
    Given the app is launched in autotest mode
    When the user skips onboarding
    Then the user button shows the no-connection state

  @allure.label.feature:Storage_Migration @allure.id:14703
  Scenario: TC-2.5.1 Legacy SSO sessions blob is migrated without a DataView error
    Given the app is launched in autotest mode
    When a legacy SSO sessions blob is seeded and the app is reloaded
    Then the onboarding screen loads without a migration crash
    And the legacy SSO sessions blob has been cleared

  @allure.label.feature:Storage_Migration @allure.id:14704
  Scenario: TC-2.5.2 Pre-Paseo-Next-V2 settings shape resets cleanly to default environment
    Given the app is launched in autotest mode
    When a legacy network settings blob is seeded and the app is reloaded
    Then the onboarding screen loads without a migration crash
    And the persisted network settings have reset to the default environment
