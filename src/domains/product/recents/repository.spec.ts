// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_RECENT_PRODUCTS } from './constants';
import { recentProductsRepository } from './repository';

beforeEach(() => {
  recentProductsRepository.clear();
});

describe('recentProductsRepository', () => {
  it('puts the most recent first', () => {
    recentProductsRepository.record('a.dot');
    recentProductsRepository.record('b.dot');

    expect(recentProductsRepository.recentProductIds$.get()).toEqual(['b.dot', 'a.dot']);
  });

  it('moves a repeat visit to the front instead of duplicating it', () => {
    recentProductsRepository.record('a.dot');
    recentProductsRepository.record('b.dot');
    recentProductsRepository.record('a.dot');

    expect(recentProductsRepository.recentProductIds$.get()).toEqual(['a.dot', 'b.dot']);
  });

  it('keeps only the cap, dropping the oldest', () => {
    for (let index = 0; index < MAX_RECENT_PRODUCTS + 5; index++) {
      recentProductsRepository.record(`p${index}.dot`);
    }
    const ids = recentProductsRepository.recentProductIds$.get();

    expect(ids).toHaveLength(MAX_RECENT_PRODUCTS);
    expect(ids[0]).toBe(`p${MAX_RECENT_PRODUCTS + 4}.dot`);
    expect(ids).not.toContain('p0.dot');
  });

  it('forgets one entry without touching the rest', () => {
    recentProductsRepository.record('a.dot');
    recentProductsRepository.record('b.dot');
    recentProductsRepository.forget('a.dot');

    expect(recentProductsRepository.recentProductIds$.get()).toEqual(['b.dot']);
  });

  it('restores a cleared snapshot, still bounded by the cap', () => {
    const oversized = Array.from({ length: MAX_RECENT_PRODUCTS + 3 }, (_, index) => `p${index}.dot`);
    recentProductsRepository.restore(oversized);

    expect(recentProductsRepository.recentProductIds$.get()).toHaveLength(MAX_RECENT_PRODUCTS);
  });

  it("persists through the address bar's original key, so an existing profile carries over", () => {
    recentProductsRepository.record('a.dot');

    expect(localStorage.getItem('polkadot_recents/v1_value')).toContain('a.dot');
  });
});
