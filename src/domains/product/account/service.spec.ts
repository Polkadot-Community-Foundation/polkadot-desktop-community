import { indexBytes } from '@novasamatech/host-container';
import { createSr25519Secret, deriveSr25519PublicKey } from '@novasamatech/statement-store';
import { describe, expect, it } from 'vitest';

import { productAccountService } from './service';

describe('productAccountService.normalizeProductAccountId', () => {
  it('strips the app executable subname down to the base name', () => {
    expect(productAccountService.normalizeProductAccountId(['app.polka.dot', { tag: 'Index', value: 0 }])).toEqual([
      'polka.dot',
      { tag: 'Index', value: 0 },
    ]);
  });

  it('strips the widget and worker executable subnames', () => {
    expect(productAccountService.normalizeProductAccountId(['widget.polka.dot', { tag: 'Index', value: 3 }])).toEqual([
      'polka.dot',
      { tag: 'Index', value: 3 },
    ]);
    expect(productAccountService.normalizeProductAccountId(['worker.polka.dot', { tag: 'Index', value: 7 }])).toEqual([
      'polka.dot',
      { tag: 'Index', value: 7 },
    ]);
  });

  it('matches the executable label case-insensitively', () => {
    expect(productAccountService.normalizeProductAccountId(['App.polka.dot', { tag: 'Index', value: 0 }])).toEqual([
      'polka.dot',
      { tag: 'Index', value: 0 },
    ]);
  });

  it('preserves a multi-label base name after stripping', () => {
    expect(productAccountService.normalizeProductAccountId(['app.foo.bar.dot', { tag: 'Index', value: 1 }])).toEqual([
      'foo.bar.dot',
      { tag: 'Index', value: 1 },
    ]);
  });

  it('leaves a bare base name untouched', () => {
    expect(productAccountService.normalizeProductAccountId(['polka.dot', { tag: 'Index', value: 0 }])).toEqual([
      'polka.dot',
      { tag: 'Index', value: 0 },
    ]);
  });

  it('does not strip when no valid base name would remain (product literally named "app")', () => {
    expect(productAccountService.normalizeProductAccountId(['app.dot', { tag: 'Index', value: 0 }])).toEqual([
      'app.dot',
      { tag: 'Index', value: 0 },
    ]);
  });

  it('leaves non-.dot identifiers (e.g. localhost) unchanged', () => {
    expect(productAccountService.normalizeProductAccountId(['localhost:3000', { tag: 'Index', value: 0 }])).toEqual([
      'localhost:3000',
      { tag: 'Index', value: 0 },
    ]);
  });

  it('preserves the derivation index', () => {
    expect(productAccountService.normalizeProductAccountId(['app.polka.dot', { tag: 'Index', value: 42 }])).toEqual([
      'polka.dot',
      { tag: 'Index', value: 42 },
    ]);
  });
});

describe('productAccountService.deriveProductAccountPublicKey', () => {
  // Arbitrary valid sr25519 key standing in for a product subtree key.
  const subtreeKey = deriveSr25519PublicKey(createSr25519Secret(new Uint8Array(32).fill(7)));

  it('derives a 32-byte sr25519 public key', () => {
    const publicKey = productAccountService.deriveProductAccountPublicKey(subtreeKey, { tag: 'Index', value: 0 });

    expect(publicKey).toHaveLength(32);
  });

  it('derives a distinct account per index', () => {
    const first = productAccountService.deriveProductAccountPublicKey(subtreeKey, { tag: 'Index', value: 0 });
    const second = productAccountService.deriveProductAccountPublicKey(subtreeKey, { tag: 'Index', value: 1 });

    expect(first).not.toEqual(second);
  });

  // RFC-0022: `Index(n)` expands to `indexBytes(n)`, so both selectors name one account.
  // Breaks if the chain code ever drifts back to a path-segment encoding.
  it('treats Index(n) and Raw(indexBytes(n)) as the same account', () => {
    const byIndex = productAccountService.deriveProductAccountPublicKey(subtreeKey, { tag: 'Index', value: 5 });
    const byRaw = productAccountService.deriveProductAccountPublicKey(subtreeKey, { tag: 'Raw', value: indexBytes(5) });

    expect(byIndex).toEqual(byRaw);
  });
});

describe('formatDerivationPath', () => {
  // RFC-0022: `//product//{productId}/{index}` — `//product` and `//{productId}` are hard,
  // `/{index}` is soft. The separators are the spec, not decoration.
  it('renders the full RFC-0022 path with hard product junctions', () => {
    expect(productAccountService.formatDerivationPath(['browse.dot', { tag: 'Index', value: 0 }])).toBe(
      '//product//browse.dot/0',
    );
  });

  it('renders a raw selector as hex in the leaf position', () => {
    const raw = new Uint8Array(32).fill(0xab);

    expect(productAccountService.formatDerivationPath(['p.dot', { tag: 'Raw', value: raw }])).toBe(
      `//product//p.dot/0x${'ab'.repeat(32)}`,
    );
  });
});

describe('isOwnedBy', () => {
  it('matches a bare base name against itself', () => {
    expect(productAccountService.isOwnedBy('foo.dot', 'foo.dot')).toBe(true);
  });

  // The asymmetry this predicate exists for: a product reports itself under its executable
  // subname, while a ring VRF key handle names the bare base.
  it('matches a handle base name against a caller reporting an executable subname', () => {
    expect(productAccountService.isOwnedBy('foo.dot', 'app.foo.dot')).toBe(true);
    expect(productAccountService.isOwnedBy('foo.dot', 'widget.foo.dot')).toBe(true);
    expect(productAccountService.isOwnedBy('foo.dot', 'worker.foo.dot')).toBe(true);
  });

  it('rejects a different product', () => {
    expect(productAccountService.isOwnedBy('peopl.dot', 'game.dot')).toBe(false);
    expect(productAccountService.isOwnedBy('peopl.dot', 'app.game.dot')).toBe(false);
  });

  it('does not strip a single-label product literally named after an executable kind', () => {
    expect(productAccountService.isOwnedBy('app.dot', 'app.dot')).toBe(true);
  });
});
