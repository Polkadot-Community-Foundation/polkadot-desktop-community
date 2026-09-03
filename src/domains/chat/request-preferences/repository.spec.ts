// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { HIDE_REQUESTS_BY_DEFAULT } from './constants';
import { requestPreferencesRepository } from './repository';

describe('requestPreferencesRepository', () => {
  it('defaults to hidden', () => {
    expect(requestPreferencesRepository.hideRequestsByDefault$.get()).toBe(HIDE_REQUESTS_BY_DEFAULT);
  });

  it('updates the preference', () => {
    requestPreferencesRepository.setHideRequestsByDefault(false);
    expect(requestPreferencesRepository.hideRequestsByDefault$.get()).toBe(false);

    requestPreferencesRepository.setHideRequestsByDefault(true);
    expect(requestPreferencesRepository.hideRequestsByDefault$.get()).toBe(true);
  });
});
