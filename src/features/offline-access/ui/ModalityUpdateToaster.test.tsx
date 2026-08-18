// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as diModule from '@/shared/di';
import { onProductModalityOpenedSideEffect } from '@/domains/product';

import { ModalityUpdateToaster } from './ModalityUpdateToaster';

const { checkModalityUpdateMock, declineRunMock, openDialogMock, toastMock } = vi.hoisted(() => ({
  checkModalityUpdateMock: vi.fn(),
  declineRunMock: vi.fn(),
  openDialogMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@novasamatech/tr-ui', () => ({ toast: toastMock }));

vi.mock('@/shared/translation', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));

vi.mock('../state/dialogState', () => ({ openOfflineAccessDialog: openDialogMock }));

vi.mock('@/domains/product', async () => {
  const di = await vi.importActual<typeof diModule>('@/shared/di');
  return {
    onProductModalityOpenedSideEffect: di.createSideEffect({ name: 'onProductModalityOpened' }),
    updatesUseCase: { checkModalityUpdate: checkModalityUpdateMock },
    useDeclineUpdate: () => ({ run: declineRunMock, pending: false }),
    manifestService: { formatVersion: (v: number[]) => v.join('.') },
  };
});

beforeEach(() => {
  // `run` from useAction returns an already-subscribed Observable; onDismiss awaits it.
  declineRunMock.mockReturnValue(of(undefined));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ModalityUpdateToaster', () => {
  it('raises a persistent Update toast when the opened modality has an undeclined update', async () => {
    checkModalityUpdateMock.mockResolvedValue({ contenthash: '0xnew', version: [1, 0, 1] });
    render(<ModalityUpdateToaster />);

    await onProductModalityOpenedSideEffect.apply({ productId: 'app.dot', kind: 'app' });

    expect(checkModalityUpdateMock).toHaveBeenCalledWith({ baseName: 'app.dot', kind: 'app' });
    expect(toastMock).toHaveBeenCalledTimes(1);
    const [, options] = toastMock.mock.calls[0]!;
    expect(options.id).toBe('modality-update:app.dot#app');
    expect(options.duration).toBe(Infinity);
  });

  it('Update action opens the per-modality confirm dialog', async () => {
    checkModalityUpdateMock.mockResolvedValue({ contenthash: '0xnew', version: [1, 0, 1] });
    render(<ModalityUpdateToaster />);
    await onProductModalityOpenedSideEffect.apply({ productId: 'app.dot', kind: 'widget' });

    const [, options] = toastMock.mock.calls[0]!;
    options.action.onClick();
    expect(openDialogMock).toHaveBeenCalledWith({ kind: 'updateExecutable', productId: 'app.dot', executableKind: 'widget' });
  });

  it('dismiss records a decline for that exact version', async () => {
    checkModalityUpdateMock.mockResolvedValue({ contenthash: '0xnew', version: [1, 0, 1] });
    render(<ModalityUpdateToaster />);
    await onProductModalityOpenedSideEffect.apply({ productId: 'app.dot', kind: 'worker' });

    const [, options] = toastMock.mock.calls[0]!;
    options.onDismiss();
    expect(declineRunMock).toHaveBeenCalledWith({
      baseName: 'app.dot',
      kind: 'worker',
      contenthash: '0xnew',
      version: [1, 0, 1],
    });
  });

  it('raises no toast when the modality has no update', async () => {
    checkModalityUpdateMock.mockResolvedValue(null);
    render(<ModalityUpdateToaster />);
    await onProductModalityOpenedSideEffect.apply({ productId: 'app.dot', kind: 'app' });
    expect(toastMock).not.toHaveBeenCalled();
  });
});
