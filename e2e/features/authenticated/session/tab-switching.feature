@authenticated @allure.label.parentSuite:authenticated @allure.label.suite:Tab_Switching @allure.label.feature:Tab_Switching
Feature: Tab switching stability (Stable)

  Verify that switching between multiple product tabs does not produce
  gray empty pages. Regression test for handler cleanup in ProductContainerBinding
  (missing cleanup caused listener accumulation and blank content on re-mount).

  Uses the shared Paseo Next network authenticated session.

  Background:
    Given the user is authenticated
    And the user is on the dashboard
    And no product tabs are open

  @allure.id:14751
  Scenario: TC-4.3.1 All tabs render content after cycling through them
    When the user opens products in new tabs:
      | product                |
      | coinflipgame03         |
      | dotns-search           |
      | host-playground        |
      | browse                 |
      | polkadotacademy        |
    And the user cycles through all tabs
    Then every tab has loaded content
