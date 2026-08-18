// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TEST_IDS } from '@/shared/test-ids';

const { usePinProductMock, usePinExecutableMock, useDisplayedProductMock, pinProductRun, pinExecutableRun } = vi.hoisted(() => ({
  usePinProductMock: vi.fn(),
  usePinExecutableMock: vi.fn(),
  useDisplayedProductMock: vi.fn(),
  pinProductRun: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
  pinExecutableRun: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
}));

vi.mock('@/domains/product', () => ({
  usePinProduct: () => usePinProductMock(),
  usePinExecutable: () => usePinExecutableMock(),
  useDisplayedProduct: () => useDisplayedProductMock(),
}));

vi.mock('@/widgets/ProductDialogHeader', () => ({ ProductDialogHeader: () => <div /> }));

vi.mock('@/shared/translation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

vi.mock('@novasamatech/tr-ui', () => ({
  Button: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick?: () => void; [k: string]: unknown }) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
  Dialog: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, {
    Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  }),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

import { UpdateVersionDialog } from './UpdateVersionDialog';

const setup = () => {
  usePinProductMock.mockReturnValue({ run: pinProductRun, pending: false });
  usePinExecutableMock.mockReturnValue({ run: pinExecutableRun, pending: false });
  useDisplayedProductMock.mockReturnValue({ data: { baseName: 'a.dot', displayName: 'A' } });
};

describe('UpdateVersionDialog', () => {
  beforeEach(() => {
    pinProductRun.mockClear();
    pinExecutableRun.mockClear();
  });

  it('re-pins the WHOLE product on confirm when no executableKind is given', () => {
    setup();
    render(<UpdateVersionDialog productId="a.dot" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId(TEST_IDS.offlineAccessUpdateConfirm));

    expect(pinProductRun).toHaveBeenCalledWith('a.dot');
    expect(pinExecutableRun).not.toHaveBeenCalled();
  });

  it('re-pins ONLY the given modality on confirm when executableKind is present', () => {
    setup();
    render(<UpdateVersionDialog productId="a.dot" executableKind="widget" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId(TEST_IDS.offlineAccessUpdateConfirm));

    expect(pinExecutableRun).toHaveBeenCalledWith({ identifier: 'a.dot', kind: 'widget' });
    expect(pinProductRun).not.toHaveBeenCalled();
  });
});
