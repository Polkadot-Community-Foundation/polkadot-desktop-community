import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readLocalAllowance = vi.fn();

vi.mock('@/domains/application', () => ({
  localAllowanceUseCase: {
    readLocalAllowance: () => readLocalAllowance(),
  },
}));

// The use case owns module-level state (the in-flight latch and the status
// stream), so each test needs a fresh module graph. That is why this spec uses
// a dynamic import instead of the static-import house style.
async function importFresh() {
  vi.resetModules();
  const { allowanceRenewalUseCase } = await import('./allowanceRenewalUseCase');
  const { allowanceRenewal } = await import('./state/renewalState');

  return { useCase: allowanceRenewalUseCase, allowanceRenewal };
}

describe('allowanceRenewalUseCase.ensureLocalAllowance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readLocalAllowance.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves false without waiting when the device already holds a slot', async () => {
    readLocalAllowance.mockResolvedValue(true);
    const { useCase, allowanceRenewal } = await importFresh();

    await expect(useCase.ensureLocalAllowance()).resolves.toBe(false);
    expect(readLocalAllowance).toHaveBeenCalledTimes(1);
    expect(allowanceRenewal.status$.get()).toBe('idle');
  });

  it('resolves false without waiting when the chain cannot answer', async () => {
    readLocalAllowance.mockResolvedValue(null);
    const { useCase, allowanceRenewal } = await importFresh();

    await expect(useCase.ensureLocalAllowance()).resolves.toBe(false);
    expect(allowanceRenewal.status$.get()).toBe('idle');
  });

  it('flips to waiting, then resolves true once the slot appears', async () => {
    readLocalAllowance.mockResolvedValueOnce(false).mockResolvedValue(true);
    const { useCase, allowanceRenewal } = await importFresh();

    const pending = useCase.ensureLocalAllowance();
    await vi.advanceTimersByTimeAsync(0);
    expect(allowanceRenewal.status$.get()).toBe('waiting');

    await vi.advanceTimersByTimeAsync(5_000);

    await expect(pending).resolves.toBe(true);
    expect(allowanceRenewal.status$.get()).toBe('idle');
  });

  it('resolves false and returns to idle when the wait times out', async () => {
    readLocalAllowance.mockResolvedValue(false);
    const { useCase, allowanceRenewal } = await importFresh();

    const pending = useCase.ensureLocalAllowance();
    await vi.advanceTimersByTimeAsync(240_000);

    await expect(pending).resolves.toBe(false);
    expect(allowanceRenewal.status$.get()).toBe('idle');
  });

  it('resolves false and stops polling when cancelled', async () => {
    readLocalAllowance.mockResolvedValue(false);
    const { useCase, allowanceRenewal } = await importFresh();

    const pending = useCase.ensureLocalAllowance();
    await vi.advanceTimersByTimeAsync(0);
    useCase.cancel();

    await expect(pending).resolves.toBe(false);
    expect(allowanceRenewal.status$.get()).toBe('idle');

    const callsAtCancel = readLocalAllowance.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readLocalAllowance.mock.calls.length).toBe(callsAtCancel);
  });

  it('runs one wait for concurrent callers and resolves them all', async () => {
    // BOTH callers do their own read before either sets the in-flight latch, so
    // both initial reads must report the lapse; only the polls report renewal.
    readLocalAllowance.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true);
    const { useCase } = await importFresh();

    const first = useCase.ensureLocalAllowance();
    const second = useCase.ensureLocalAllowance();
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('cancel is a no-op when nothing is waiting', async () => {
    const { useCase } = await importFresh();

    expect(() => useCase.cancel()).not.toThrow();
  });
});
