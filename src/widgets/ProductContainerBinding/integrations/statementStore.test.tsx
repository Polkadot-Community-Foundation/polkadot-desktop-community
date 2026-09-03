// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as applicationDomain from '@/domains/application';

import { useStatementStore } from './statementStore';

const { subscribeStatementsMock, usePappProviderMock, useSessionMock } = vi.hoisted(() => ({
  subscribeStatementsMock: vi.fn(),
  usePappProviderMock: vi.fn(() => null),
  useSessionMock: vi.fn(() => ({ session: null })),
}));

vi.mock('@/domains/application', async importOriginal => {
  const real = await importOriginal<typeof applicationDomain>();
  return {
    ...real,
    usePappProvider: () => usePappProviderMock(),
    statementStoreAdapter: {
      submitStatement: vi.fn(),
      queryStatements: vi.fn(),
      subscribeStatements: (...args: unknown[]) => subscribeStatementsMock(...args),
    },
  };
});

vi.mock('@novasamatech/host-papp-react-ui', () => ({ useSession: () => useSessionMock() }));

type SubscribeHandler = (
  topics: { tag: 'MatchAll' | 'MatchAny'; value: unknown[] },
  send: (msg: unknown) => void,
) => VoidFunction;

function createFakeContainer() {
  let subscribeHandler: SubscribeHandler | null = null;

  const container = {
    handleStatementStoreSubmit: vi.fn(() => vi.fn()),
    handleStatementStoreSubscribe: vi.fn((handler: SubscribeHandler) => {
      subscribeHandler = handler;
      return vi.fn();
    }),
    handleStatementStoreCreateProof: vi.fn(() => vi.fn()),
    handleStatementStoreCreateProofAuthorized: vi.fn(() => vi.fn()),
  };

  return {
    // Only the surface useStatementStore touches; cast at the test boundary.
    container: container as any,
    getSubscribeHandler: () => {
      if (!subscribeHandler) throw new Error('subscribe handler not registered');
      return subscribeHandler;
    },
  };
}

// A statement that maps to a non-null host statement, so a forwarded emission
// reaches send(). Without this the disposed-gate assertion would pass trivially.
const mappableStatement = {
  proof: { type: 'sr25519', value: { signature: '0x01', signer: '0x02' } },
  topics: [],
};

type ProducerEmit = (msg: { statements: unknown[]; isComplete: boolean }) => void;

// Wire subscribeStatements to expose the producer callback so a test can drive
// emissions, the same way the SDK's batched flush would.
function captureProducerEmit() {
  let emit: ProducerEmit | null = null;
  subscribeStatementsMock.mockImplementation((_filter, cb: ProducerEmit) => {
    emit = cb;
    return vi.fn();
  });
  return () => {
    if (!emit) throw new Error('producer not subscribed');
    return emit;
  };
}

beforeEach(() => {
  subscribeStatementsMock.mockReset();
  usePappProviderMock.mockReset();
  useSessionMock.mockReset();
  usePappProviderMock.mockReturnValue(null);
  useSessionMock.mockReturnValue({ session: null });
});

describe('useStatementStore teardown', () => {
  it('forwards statements to send while mounted', () => {
    const getEmit = captureProducerEmit();

    const { container, getSubscribeHandler } = createFakeContainer();
    renderHook(() => useStatementStore(container, 'app.dot'));

    const send = vi.fn();
    getSubscribeHandler()({ tag: 'MatchAll', value: [] }, send);

    getEmit()({ statements: [mappableStatement], isComplete: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes the SDK producer when the hook unmounts', () => {
    const producerUnsub = vi.fn();
    subscribeStatementsMock.mockImplementation(() => producerUnsub);

    const { container, getSubscribeHandler } = createFakeContainer();
    const { unmount } = renderHook(() => useStatementStore(container, 'app.dot'));

    getSubscribeHandler()({ tag: 'MatchAll', value: [] }, vi.fn());
    expect(producerUnsub).not.toHaveBeenCalled();

    unmount();

    expect(producerUnsub).toHaveBeenCalledTimes(1);
  });

  it('does not call send for emissions that arrive after unmount', () => {
    const getEmit = captureProducerEmit();

    const { container, getSubscribeHandler } = createFakeContainer();
    const { unmount } = renderHook(() => useStatementStore(container, 'app.dot'));

    const send = vi.fn();
    getSubscribeHandler()({ tag: 'MatchAll', value: [] }, send);

    unmount();

    // Simulates a setTimeout(flush, 0) macrotask that was queued before teardown.
    getEmit()({ statements: [mappableStatement], isComplete: true });

    expect(send).not.toHaveBeenCalled();
  });
});
