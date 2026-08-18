@auth @allure.label.parentSuite:auth @allure.label.suite:Sign_in
Feature: Sign In via Signing Bot

  @allure.label.feature:Sign_in_PaseoNextV2 @allure.id:14689
  Scenario: TC-2.1.1 Sign in on Paseo Next V2 via signing bot reaches the dashboard
    Given the app is launched in autotest mode
    And the user selects the "nightly" environment
    And the QR code is displayed on onboarding screen
    When the user pairs via signing bot on "nightly" as "desktopauth"
    Then the user is redirected to dashboard
    And user info is visible in the top bar

  # TC-2.1.3 (14691) Sign in on Paseo Next (v1) — SKIPPED: the e2e environment catalog
  # (VITE_ENVIRONMENTS) configures only two channels — `nightly` (Paseo Next V2 →
  # bot network paseo-next-v2) and `unstable` (PreviewNet → preview). There is no
  # separate "Paseo Next v1" channel to select or pair against, so the case is not
  # drivable. Left manual until a v1 channel is configured for e2e.

  @allure.label.feature:Sign_in_BotHealth @allure.id:14692
  Scenario: TC-2.1.4 Signing-bot health indicator reflects reachability
    Given the app is launched in autotest mode
    And the signing bot panel is visible
    When the user enters the reachable signing bot URL
    Then the signing bot health indicator shows reachable
    When the user enters an unreachable signing bot URL
    Then the signing bot health indicator shows unreachable

  # TC-2.1.5 (14693) — SKIPPED: the Connect button's `disabled={!qrPayload}` gate
  # has no deterministically-observable pre-payload window. host-papp generates the
  # pairing `payload` (QR deeplink) client-side almost immediately after
  # `authenticate()`, so by the time the onboarding screen settles the button is
  # already enabled; catching the sub-second disabled state is irredeemably racy
  # (confirmed: the disabled assertion lost the race on a clean run). The enabled
  # end-state is exercised by the Connect click in TC-2.1.1. Body kept for the day
  # the payload generation can be delayed/intercepted deterministically.
  @allure.label.feature:Sign_in_ConnectGating @allure.id:14693 @skip
  Scenario: TC-2.1.5 Connect button is disabled until QR payload is available
    Given the app is launched in autotest mode
    Then the signing bot connect button is disabled
    When the QR code is displayed on onboarding screen
    Then the signing bot connect button is enabled

  @allure.label.feature:Sign_in_Previewnet @allure.id:14690 @skip
  Scenario: TC-2.1.2 Sign in on Previewnet environment
    Given the app is launched in autotest mode
    And the user selects the "unstable" environment
    And the QR code is displayed on onboarding screen
    When the user pairs via signing bot on "unstable" as "desktopauth"
    Then the user is redirected to dashboard
    And session data exists in localStorage
    And user info is visible in the top bar

  @allure.label.feature:Log_out @allure.id:14698
  Scenario: TC-2.3.1 Logout clears session and redirects to onboarding
    Given the app is launched in autotest mode
    And the user is signed in on "nightly" via signing bot as "desktopauth"
    When the user clicks logout
    Then user secrets are removed from localStorage
    And the user is redirected to onboarding screen
