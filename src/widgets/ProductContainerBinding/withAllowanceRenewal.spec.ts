import { errAsync, okAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureLocalAllowance = vi.fn();

vi.mock('@/aggregates/allowance-renewal', () => ({
  allowanceRenewalUseCase: {
    ensureLocalAllowance: () => ensureLocalAllowance(),
  },
}));

import { withAllowanceRenewal } from './withAllowanceRenewal';

describe('withAllowanceRenewal', () => {
  beforeEach(() => {
    ensureLocalAllowance.mockReset();
  });

  it('invokes the request once and returns its value on success', async () => {
    const request = vi.fn(() => okAsync('signed'));

    const result = await withAllowanceRenewal(request);

    expect(result.isOk() && result.value).toBe('signed');
    expect(request).toHaveBeenCalledTimes(1);
    expect(ensureLocalAllowance).not.toHaveBeenCalled();
  });

  it('propagates the original error when no renewal happened', async () => {
    const original = new Error('rejected by signer');
    const request = vi.fn(() => errAsync(original));
    ensureLocalAllowance.mockResolvedValue(false);

    const result = await withAllowanceRenewal(request);

    expect(result.isErr() && result.error).toBe(original);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once after a successful renewal', async () => {
    const request = vi
      .fn()
      .mockReturnValueOnce(errAsync(new Error('no allowance')))
      .mockReturnValueOnce(okAsync('signed'));
    ensureLocalAllowance.mockResolvedValue(true);

    const result = await withAllowanceRenewal(request);

    expect(result.isOk() && result.value).toBe('signed');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('propagates the second failure without retrying again', async () => {
    const second = new Error('still failing');
    const request = vi
      .fn()
      .mockReturnValueOnce(errAsync(new Error('no allowance')))
      .mockReturnValueOnce(errAsync(second));
    ensureLocalAllowance.mockResolvedValue(true);

    const result = await withAllowanceRenewal(request);

    expect(result.isErr() && result.error).toBe(second);
    expect(request).toHaveBeenCalledTimes(2);
    expect(ensureLocalAllowance).toHaveBeenCalledTimes(1);
  });
});
