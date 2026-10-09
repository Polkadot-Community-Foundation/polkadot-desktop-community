import path from 'path';

import { describe, expect, it } from 'vitest';

import { CACHE_ROOT, PAIRED_LINE, freshLiteUsernameBase, slotPath, stripAnsi } from './signing-host';

describe('slotPath', () => {
  it('joins project and worker index under the cache root', () => {
    expect(slotPath('auth', 0)).toBe(path.join(CACHE_ROOT, 'auth-w0'));
    expect(slotPath('authenticated', 3)).toBe(path.join(CACHE_ROOT, 'authenticated-w3'));
  });

  it('keeps a hyphenated project name intact', () => {
    expect(slotPath('product-sdk', 1)).toBe(path.join(CACHE_ROOT, 'product-sdk-w1'));
  });

  it('appends a suffix when given, for fixtures needing two identities per worker', () => {
    expect(slotPath('chatpair', 1, 'a')).toBe(path.join(CACHE_ROOT, 'chatpair-w1a'));
    expect(slotPath('chatpair', 1, 'b')).toBe(path.join(CACHE_ROOT, 'chatpair-w1b'));
  });

  it('rejects a negative worker index', () => {
    expect(() => slotPath('auth', -1)).toThrow(/worker index/i);
  });

  it('rejects a non-integer worker index', () => {
    expect(() => slotPath('auth', 1.5)).toThrow(/worker index/i);
  });
});

describe('PAIRED_LINE', () => {
  // Verbatim from a real `--serve` start; the leading glyph and spacing are the CLI's.
  it('extracts the lite username from the startup line', () => {
    expect('✓ Paired with desktopprobe.84'.match(PAIRED_LINE)?.[1]).toBe('desktopprobe.84');
  });

  // Regression: the CLI colourises this line, `\S+` swallowed the trailing reset, and the
  // captured `truapitest.43\u001b[0m` matched no contact in the UI. Playwright's reporter
  // strips these codes on the way to a log file, so the saved artifact looked clean.
  it('yields a bare username once the line is stripped', () => {
    const colourised = '\u001b[32m✓\u001b[0m Paired with \u001b[1mtruapitest.43\u001b[0m';

    expect(stripAnsi(colourised).match(PAIRED_LINE)?.[1]).toBe('truapitest.43');
  });

  it('captures the escape when stripping is skipped — the bug this guards', () => {
    expect('✓ Paired with truapitest.43\u001b[0m'.match(PAIRED_LINE)?.[1]).not.toBe('truapitest.43');
  });

  it('ignores the other startup lines', () => {
    expect('✓ Signing host ready'.match(PAIRED_LINE)).toBeNull();
    expect('• Listening for product frames'.match(PAIRED_LINE)).toBeNull();
    expect('• Serving product frames until stopped'.match(PAIRED_LINE)).toBeNull();
  });
});

describe('stripAnsi', () => {
  it('leaves uncoloured output untouched', () => {
    expect(stripAnsi('✓ Signing host ready')).toBe('✓ Signing host ready');
  });

  it('clears colour around a device id so the anchored parser still matches', () => {
    const line = `\u001b[2m0x${'a'.repeat(64)}\u001b[0m  MacBook`;

    expect(stripAnsi(line)).toBe(`0x${'a'.repeat(64)}  MacBook`);
  });
});

describe('freshLiteUsernameBase', () => {
  // The rules the backend validates a base against (`is_valid_base`, 6..=29 lowercase
  // ASCII letters) and the CLI re-checks locally (`lite_username_base`). A base that
  // fails either is rejected before a single identity is minted.
  it('satisfies the base rules both the CLI and the backend enforce', () => {
    const base = freshLiteUsernameBase();

    expect(base).toMatch(/^[a-z]{6,29}$/);
  });

  it('carries the harness stem, so its registrations stay attributable', () => {
    expect(freshLiteUsernameBase()).toMatch(/^truapitest/);
  });

  // The property the whole scheme rests on: a base is a finite chain-level pool (99
  // discriminators, and `EXHAUSTED` too once the bare name is owned or its reservation
  // queue is full), so two identities must never be minted under one.
  it('mints a different base every time', () => {
    const bases = new Set(Array.from({ length: 50 }, () => freshLiteUsernameBase()));

    expect(bases.size).toBe(50);
  });
});
