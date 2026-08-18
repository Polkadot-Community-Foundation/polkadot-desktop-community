import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openDialogMock, addableCardsMock } = vi.hoisted(() => ({
  openDialogMock: vi.fn(),
  addableCardsMock: vi.fn<() => { gridId: string }[]>(() => []),
}));

vi.mock('./state/addToDashboardDialog', () => ({
  openAddToDashboardDialog: openDialogMock,
}));

vi.mock('./di', () => ({
  addableDashboardCardsPipeline: () => addableCardsMock(),
}));

import { openNativeAddToDashboardDialog } from './addableDashboardCards';

describe('openNativeAddToDashboardDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addableCardsMock.mockReturnValue([]);
  });

  it('opens the dialog for a native addable id without resolving a chain product', () => {
    addableCardsMock.mockReturnValue([{ gridId: 'chat' }]);

    expect(openNativeAddToDashboardDialog('chat')).toBe(true);

    expect(openDialogMock).toHaveBeenCalledWith('chat');
  });

  it('returns false for ids that are not native addable entries', () => {
    addableCardsMock.mockReturnValue([{ gridId: 'chat' }]);

    expect(openNativeAddToDashboardDialog('app.dot')).toBe(false);

    expect(openDialogMock).not.toHaveBeenCalled();
  });
});
