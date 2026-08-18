import { ResultAsync } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../dashboard-layout/repository', () => ({
  dashboardLayoutDb: {
    getMain: vi.fn(),
    saveMainPages: vi.fn(),
  },
}));

import { type MainDashboardLayoutSnapshot, dashboardLayoutDb } from '../dashboard-layout/repository';
import { dashboardLayoutService } from '../dashboard-layout/service';
import { type DashboardCard } from '../dashboard-layout/types';

import { cardsUseCase } from './cards';

const nativeCard = (id: string): DashboardCard => ({ i: id, x: 0, y: 0, w: 1, h: 4, payload: { kind: `native:${id}` } });
const widgetCard = (productId: string): DashboardCard => ({
  i: productId,
  x: 0,
  y: 0,
  w: 1,
  h: 4,
  payload: { kind: 'product:widget', productId },
});

const okMain = (pages: MainDashboardLayoutSnapshot['pages'] | null) =>
  ResultAsync.fromSafePromise<MainDashboardLayoutSnapshot | null, Error>(
    Promise.resolve(pages === null ? null : { pages, activePageIndex: 0 }),
  );
const errMain = () => ResultAsync.fromPromise(Promise.reject(new Error('db')), e => (e instanceof Error ? e : new Error()));

beforeEach(() => {
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  vi.mocked(dashboardLayoutDb.saveMainPages).mockReturnValue(ResultAsync.fromSafePromise(Promise.resolve({} as never)));
});

describe('seedDefaultMainLayout', () => {
  it('seeds the default pages when no dashboard exists yet', async () => {
    vi.mocked(dashboardLayoutDb.getMain).mockReturnValue(okMain(null));

    const seeded = await cardsUseCase.seedDefaultMainLayout('browse.dot');

    expect(seeded).toBe(true);
    expect(dashboardLayoutDb.saveMainPages).toHaveBeenCalledWith(dashboardLayoutService.defaultPages('browse.dot'), 0);
  });

  it('is a no-op when a dashboard already has pages', async () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    vi.mocked(dashboardLayoutDb.getMain).mockReturnValue(okMain([[{ i: 'x' } as never]]));

    const seeded = await cardsUseCase.seedDefaultMainLayout('browse.dot');

    expect(seeded).toBe(false);
    expect(dashboardLayoutDb.saveMainPages).not.toHaveBeenCalled();
  });

  it('does not seed when the layout read fails', async () => {
    vi.mocked(dashboardLayoutDb.getMain).mockReturnValue(errMain());

    const seeded = await cardsUseCase.seedDefaultMainLayout('browse.dot');

    expect(seeded).toBe(false);
    expect(dashboardLayoutDb.saveMainPages).not.toHaveBeenCalled();
  });
});

describe('addCardToLayout (non-widget card)', () => {
  it('places a native card and persists it', async () => {
    vi.mocked(dashboardLayoutDb.getMain).mockReturnValue(okMain([[]]));

    const result = await cardsUseCase.addCardToLayout(nativeCard('chat'));

    expect(result.ok).toBe(true);
    const savedPages = vi.mocked(dashboardLayoutDb.saveMainPages).mock.calls[0]?.[0];
    expect(savedPages?.some(page => page.some(item => item.i === 'chat'))).toBe(true);
  });

  it('rejects a duplicate of the same id without saving', async () => {
    vi.mocked(dashboardLayoutDb.getMain).mockReturnValue(okMain([[nativeCard('chat')]]));

    const result = await cardsUseCase.addCardToLayout(nativeCard('chat'));

    expect(result.ok).toBe(false);
    expect(dashboardLayoutDb.saveMainPages).not.toHaveBeenCalled();
  });
});

describe('addCardToLayout (content card)', () => {
  it('places a product:widget card and persists it verbatim', async () => {
    vi.mocked(dashboardLayoutDb.getMain).mockReturnValue(okMain([[]]));

    const result = await cardsUseCase.addCardToLayout(widgetCard('app.dot'));

    expect(result.ok).toBe(true);
    const savedPages = vi.mocked(dashboardLayoutDb.saveMainPages).mock.calls[0]?.[0];
    const saved = savedPages?.flat().find(item => item.i === 'app.dot');
    expect(saved?.payload.kind).toBe('product:widget');
  });

  it('rejects when a card with the same id is already placed', async () => {
    vi.mocked(dashboardLayoutDb.getMain).mockReturnValue(okMain([[widgetCard('app.dot')]]));

    const result = await cardsUseCase.addCardToLayout(widgetCard('app.dot'));

    expect(result.ok).toBe(false);
    expect(dashboardLayoutDb.saveMainPages).not.toHaveBeenCalled();
  });
});
