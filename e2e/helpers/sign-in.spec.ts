import { describe, expect, it, vi } from 'vitest';

import { OS_SUFFIX } from './bot-user';
import { PairingLimitError, StuckPairingError, shouldHealPermanentUser, signInWithHeal, withSignInRetries } from './sign-in';

const { deleteBotUserMock, ensureMock } = vi.hoisted(() => ({
  deleteBotUserMock: vi.fn().mockResolvedValue(undefined),
  ensureMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./bot-user', async importOriginal => {
  const orig = await importOriginal<Record<string, unknown>>();
  return {
    ...orig,
    deleteBotUser: deleteBotUserMock,
    BotUserSession: class {
      constructor(public username: string) {}
      ensure = ensureMock;
    },
  };
});

describe('shouldHealPermanentUser', () => {
  const permanent = `desktopauth${OS_SUFFIX}`;

  it('heals a permanent user stuck in pairing', () => {
    expect(shouldHealPermanentUser(new StuckPairingError(45), permanent)).toBe(true);
  });

  it('heals a permanent user rejected with the no-free-slots "Limit Reached" error', () => {
    expect(shouldHealPermanentUser(new PairingLimitError(), permanent)).toBe(true);
  });

  it('does not heal random users — nothing to reset', () => {
    expect(shouldHealPermanentUser(new StuckPairingError(45), 'testbotabcdefghij')).toBe(false);
    expect(shouldHealPermanentUser(new PairingLimitError(), 'testbotabcdefghij')).toBe(false);
  });

  it('does not heal on other errors (timeouts, assertion failures)', () => {
    expect(shouldHealPermanentUser(new Error('waitForURL timeout'), permanent)).toBe(false);
  });
});

describe('withSignInRetries on PairingLimitError', () => {
  it('aborts remaining attempts — the daily slot budget cannot recover within a run', async () => {
    let calls = 0;
    const attempt = async (): Promise<void> => {
      calls++;
      throw new PairingLimitError();
    };

    await expect(withSignInRetries(attempt, { label: 'test', attempts: 3, delayMs: 1 })).rejects.toBeInstanceOf(
      PairingLimitError,
    );
    expect(calls).toBe(1);
  });
});

describe('signInWithHeal on PairingLimitError', () => {
  const permanent = `desktopauth${OS_SUFFIX}`;

  it('heals a permanent user immediately: one failed attempt, then a fresh identity', async () => {
    deleteBotUserMock.mockClear();
    const attempted: string[] = [];
    const attempt = async (username: string): Promise<void> => {
      attempted.push(username);
      if (username === permanent) throw new PairingLimitError();
    };

    const signedIn = await signInWithHeal({
      label: 'test',
      network: 'nightly',
      botUrl: 'http://bot.invalid',
      botToken: undefined,
      username: permanent,
      attempt,
      retryDelayMs: 1,
    });

    // First phase aborts after ONE attempt (no pointless retry against an
    // exhausted daily budget), then the heal path signs in a fresh identity.
    expect(attempted[0]).toBe(permanent);
    expect(attempted.filter(u => u === permanent)).toHaveLength(1);
    expect(signedIn).not.toBe(permanent);
    expect(signedIn.startsWith('testbot')).toBe(true);
    expect(deleteBotUserMock).toHaveBeenCalledWith(expect.objectContaining({ username: permanent, network: 'nightly' }));
  });
});

describe('signInWithHeal first-phase attempt budget', () => {
  const permanent = `desktopauth${OS_SUFFIX}`;

  it('gives a non-permanent identity the full shared budget (3 attempts) and rethrows', async () => {
    let calls = 0;
    const attempt = async (): Promise<void> => {
      calls++;
      throw new Error('boom');
    };

    await expect(
      signInWithHeal({
        label: 'test',
        network: 'nightly',
        botUrl: 'http://bot.invalid',
        botToken: undefined,
        username: 'testbotabcdefghij',
        attempt,
        retryDelayMs: 1,
      }),
    ).rejects.toThrow('boom');
    expect(calls).toBe(3);
  });

  it('stops a permanent identity at 2 attempts and rethrows without healing when the error is not StuckPairingError', async () => {
    let calls = 0;
    const attempt = async (): Promise<void> => {
      calls++;
      throw new Error('boom');
    };

    await expect(
      signInWithHeal({
        label: 'test',
        network: 'nightly',
        botUrl: 'http://bot.invalid',
        botToken: undefined,
        username: permanent,
        attempt,
        retryDelayMs: 1,
      }),
    ).rejects.toThrow('boom');
    expect(calls).toBe(2);
  });
});
