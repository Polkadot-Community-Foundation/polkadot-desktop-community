// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEST_IDS } from '@/shared/test-ids';
import { TranslationProvider } from '@/shared/translation';
import type * as productDomain from '@/domains/product';
import { resetRound } from '../state/round';
import { inputSurfaceInitialText, inputSurfaceOpen } from '../state/surface';

import { InputSpotlight } from './InputSpotlight';

// PARKED — product querying. Restore with the rest of the `PARKED` blocks in
// this feature. Also dropped from the imports above: `delay`, `type RoundView`,
// `inputRound`.
//
// The real hook reads the router, the dashboard resource, chat rooms and the
// installed products; the context set it derives is covered by `service.spec.ts`.
// The surface no longer calls it, so the mock is inert while this is parked.
// const contextProductIds = vi.hoisted(() => ({ current: ['wallet', 'notes'] }));
// vi.mock('../hooks/useInputContext', () => ({ useInputContext: () => contextProductIds.current }));
//
// The mount effect pushes an empty request; give the pipeline a beat to resolve
// it to idle before a test states a round of its own.
// const settled = () => act(async () => void (await delay(400)));
//
// const answered = (text: string): RoundView => ({
//   kind: 'query',
//   candidates: [{ id: 'wallet:0', productId: 'wallet', content: { type: 'text', text } }],
//   pending: false,
//   asked: 1,
// });

const openDotNsUrl = vi.hoisted(() => vi.fn());
vi.mock('@/features/browser', () => ({ openDotNsUrlSideEffect: { apply: openDotNsUrl } }));

// Everything the surface decides is keyed on the network's TLD, and the real read
// goes through the active environment — which never resolves here. The rest of the
// domain (name parsing, the recents writes) stays real.
const tldRead = vi.hoisted(() => ({
  current: { data: '.dot', pending: false, error: null as unknown, refresh: () => {} },
}));

// The settled read the surface's own decisions go through. `deferred` holds the
// answer open so a test can land it after the surface has already moved on.
const activeTld = vi.hoisted(() => {
  let release: (tld: string) => void = () => {};

  return {
    deferred: false,
    read: () => (activeTld.deferred ? new Promise<string>(resolve => (release = resolve)) : Promise.resolve('.dot')),
    // The navigation resolves the TLD again on its way through `openProduct`, so
    // stop deferring as the held answer lands — otherwise the chain stalls on a
    // second promise nothing releases.
    settle: () => {
      activeTld.deferred = false;
      release('.dot');
    },
  };
});

vi.mock('@/domains/product', async importOriginal => {
  const real = await importOriginal<typeof productDomain>();

  return {
    ...real,
    dotNsUseCase: { getActiveTld: () => activeTld.read() },
    useDotNsTld: () => tldRead.current,
  };
});

const renderSurface = () =>
  render(
    <TranslationProvider>
      <InputSpotlight />
    </TranslationProvider>,
  );

const open = () => act(() => void inputSurfaceOpen.set(true));

const type = (text: string) => {
  fireEvent.change(screen.getByTestId(TEST_IDS.inputModalityInput), { target: { value: text } });
};

afterEach(() => {
  // Without this a previous test's navigation satisfies a later assertion — which
  // is what let "Enter does nothing on a bare name" pass unnoticed.
  openDotNsUrl.mockClear();
  tldRead.current = { data: '.dot', pending: false, error: null, refresh: () => {} };
  activeTld.deferred = false;
  cleanup();
  act(() => void inputSurfaceOpen.set(false));
  act(() => void inputSurfaceInitialText.set(''));
  resetRound();
});

describe('InputSpotlight', () => {
  it('renders nothing while closed', () => {
    renderSurface();

    expect(screen.queryByTestId(TEST_IDS.inputModalitySurface)).toBeNull();
  });

  it('opens on whatever the address bar was showing', () => {
    act(() => void inputSurfaceInitialText.set('browse.dot/apps'));
    renderSurface();
    open();

    expect(screen.getByTestId(TEST_IDS.inputModalityInput)).toHaveValue('browse.dot/apps');
  });

  it('navigates on Enter without waiting for the debounce', async () => {
    renderSurface();
    open();
    type('browse.dot');
    // Deliberately no settle: the navigation must not depend on a round having
    // landed, or a fast typist gets nothing. It does wait on the network's TLD —
    // the name cannot be parsed without knowing the suffix — which is one cached
    // read, not the debounce.
    fireEvent.keyDown(screen.getByTestId(TEST_IDS.inputModalityInput), { key: 'Enter' });

    await waitFor(() => expect(openDotNsUrl).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'browse.dot' })));
  });

  it('accepts the ghost completion on Enter', async () => {
    renderSurface();
    open();
    type('hackm3');

    fireEvent.keyDown(screen.getByTestId(TEST_IDS.inputModalityInput), { key: 'Enter' });

    await waitFor(() => expect(openDotNsUrl).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'hackm3.dot' })));
  });

  it('completes the network suffix on Tab', () => {
    renderSurface();
    open();
    type('hackm3');

    fireEvent.keyDown(screen.getByTestId(TEST_IDS.inputModalityInput), { key: 'Tab' });

    expect(screen.getByTestId(TEST_IDS.inputModalityInput)).toHaveValue('hackm3.dot');
  });

  it('offers no completion until the TLD is known', () => {
    // Tab writes the suffix into the field and Enter routes that text against the
    // settled TLD, so completing under the fallback leaves a name that resolves on
    // no network and an Enter that silently does nothing.
    tldRead.current = { data: '.dot', pending: true, error: null, refresh: () => {} };
    renderSurface();
    open();
    type('hackm3');

    fireEvent.keyDown(screen.getByTestId(TEST_IDS.inputModalityInput), { key: 'Tab' });

    expect(screen.getByTestId(TEST_IDS.inputModalityInput)).toHaveValue('hackm3');
  });

  // The surface unmounts when it closes and `inputSurfaceOpen` outlives it, so a
  // TLD read that lands after the user reopened the surface must not close the one
  // now on screen — opening several tabs in a row is exactly that sequence.
  it('does not close a reopened surface when an earlier navigation settles late', async () => {
    activeTld.deferred = true;
    renderSurface();
    open();
    type('browse.dot');
    fireEvent.keyDown(screen.getByTestId(TEST_IDS.inputModalityInput), { key: 'Enter' });

    // That opening goes away before its read answers, and a new one takes its place.
    act(() => void inputSurfaceOpen.set(false));
    act(() => void inputSurfaceOpen.set(true));
    expect(screen.getByTestId(TEST_IDS.inputModalitySurface)).toBeInTheDocument();

    await act(async () => {
      activeTld.settle();
    });
    await waitFor(() => expect(openDotNsUrl).toHaveBeenCalled());

    expect(screen.queryByTestId(TEST_IDS.inputModalitySurface)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    renderSurface();
    open();
    expect(screen.getByTestId(TEST_IDS.inputModalitySurface)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId(TEST_IDS.inputModalitySurface)).toBeNull());
  });

  // PARKED — product querying. These four asserted what the products on screen
  // answered; the surface now asks nobody, so there is nothing for them to see.
  //
  // The shipped gateway declines everything — it is unwired, and inventing
  // answers there put actions in front of the user that did nothing. So a round
  // driven by typing can only produce the declined case; the answered case sets
  // the round directly. What a round *produces* is `state/round.spec.ts`'s job
  // anyway — these assert only that the surface renders one, which is this
  // component's.
  //
  // it('renders what the products on screen answered', async () => {
  //   renderSurface();
  //   open();
  //   await settled();
  //   act(() => void inputRound.set(answered('Send 5 DOT to alice')));
  //
  //   await waitFor(() => expect(screen.getAllByTestId(TEST_IDS.inputModalityCandidate).length).toBe(1));
  //   expect(screen.getByText('Send 5 DOT to alice')).toBeInTheDocument();
  // });
  //
  // it('says so when every product declines', async () => {
  //   renderSurface();
  //   open();
  //   type('alice');
  //
  //   await waitFor(() => expect(screen.getByTestId(TEST_IDS.inputModalityNoCandidates)).toBeInTheDocument(), {
  //     timeout: 4000,
  //   });
  // });
  //
  // it('asks nobody when the screen contributes no products', async () => {
  //   contextProductIds.current = [];
  //   renderSurface();
  //   open();
  //
  //   // An empty field on an empty screen has no question to answer yet.
  //   expect(screen.queryByTestId(TEST_IDS.inputModalityNoContext)).toBeNull();
  //
  //   type('alice');
  //
  //   await waitFor(() => expect(screen.getByTestId(TEST_IDS.inputModalityNoContext)).toBeInTheDocument());
  //   expect(screen.queryAllByTestId(TEST_IDS.inputModalityCandidate)).toHaveLength(0);
  // });
  //
  // it('selects the top-ranked candidate on Enter once a round has answered', async () => {
  //   renderSurface();
  //   open();
  //   // The surface drives `inputRound` from the field on mount, so let that
  //   // settle before setting a round by hand — otherwise its own effect wins the
  //   // race and the candidate never renders.
  //   await settled();
  //
  //   act(() => void inputRound.set(answered('Send 5 DOT to alice')));
  //   await waitFor(() => expect(screen.getAllByTestId(TEST_IDS.inputModalityCandidate).length).toBe(1));
  //
  //   fireEvent.keyDown(screen.getByTestId(TEST_IDS.inputModalityInput), { key: 'Enter' });
  //
  //   // Selecting closes the surface.
  //   await waitFor(() => expect(screen.queryByTestId(TEST_IDS.inputModalitySurface)).toBeNull());
  // });
});
