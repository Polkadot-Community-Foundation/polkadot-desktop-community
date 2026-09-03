import { createNanoEvents } from 'nanoevents';
import { type Observable, BehaviorSubject, finalize, firstValueFrom, from, of, shareReplay, switchMap, tap } from 'rxjs';

import { createAsyncTaskPool, createCache } from '@/shared/utils';

import { createDefaultCacheMapper, createDefaultInitial, wrapKeyFactory } from './generic';
import { onOverride } from './overrides';
import { type DefaultCache, type KeyFn, type MapCacheFn, type Overridable, type Resource, type ResourceKey } from './types';

type RequestFn<Params, Response> = (params: Params) => Response | Promise<Response>;

type QueryParams<Params, Response, Cache> = {
  key: KeyFn<Params>;
  fn: RequestFn<Params, Response>;
  timeout?: number;
  cache: {
    initial: Cache;
    map: MapCacheFn<Params, Response, Cache>;
    staleAfter?: number;
  };
  retry?: {
    count: number;
    delay: number;
  };
};

type CacheOrDefault<Cache, Response> = [Cache] extends [never] ? DefaultCache<Response> : Cache;

function build<Params, Response, Cache>({
  key,
  fn,
  timeout,
  retry,
  cache,
}: QueryParams<Params, Response, Cache>): Resource<Params, Response, Cache> & Overridable<RequestFn<Params, Response>> {
  // The request is read through this at call time rather than captured, so
  // `instead` can swap it. Holds the real implementation outside tests.
  let activeFn = fn;
  const events = createNanoEvents<{ read: Parameters<Resource<Params, Response, Cache>['onRead']>[0] }>();

  const createKey = wrapKeyFactory(key);
  const requestPool = createAsyncTaskPool({ poolSize: 1, retryCount: retry?.count ?? 0, retryDelay: retry?.delay ?? 0 });

  const cache$ = new BehaviorSubject<Cache>(cache.initial);
  const requestsCache = createCache<ResourceKey, Response>({ now: () => Date.now() });
  const requests: Record<ResourceKey, Observable<Response>> = {};

  function pending$(params: Params) {
    const key = createKey(params);
    return requests[key] ?? null;
  }

  function read$(params: Params) {
    const key = createKey(params);
    const existing = requests[key];
    if (existing) {
      return existing;
    }

    return from(requestsCache.get(key)).pipe(
      switchMap(result => {
        if (result.hit) {
          return of(result.value);
        }

        const $request = makeRequest(params, key);
        requestsCache.setRequest(key, firstValueFrom($request), cache.staleAfter ?? 0);
        return $request;
      }),
    );
  }

  function makeRequest(params: Params, key: ResourceKey) {
    const request$ = from(
      requestPool.call(() => activeFn(params), {
        pool: key,
        signal: timeout ? AbortSignal.timeout(timeout) : undefined,
      }),
    ).pipe(
      tap(response => cache$.next(cache.map(cache$.value, response, params))),
      finalize(() => delete requests[key]),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    requests[key] = request$;

    events.emit('read', request$, params);

    return request$;
  }

  function invalidate(params: Partial<Params>): Cache {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const key = createKey(params as Params);
    requestsCache.delete(key);
    delete requests[key];
    const previous = cache$.value;
    if (typeof previous === 'object' && previous !== null && key in previous) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const copy = { ...previous } as Record<string, unknown>;
      delete copy[key];
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      cache$.next(copy as Cache);
    }
    return previous;
  }

  function invalidateAll() {
    requestsCache.clear();
    for (const key of Object.keys(requests)) {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      delete requests[key as ResourceKey];
    }
    cache$.next(cache.initial);
  }

  return {
    key: createKey,
    cache$,
    read$,
    pending$,
    onRead(callback) {
      return events.on('read', callback);
    },
    invalidate,
    invalidateAll,
    instead(next) {
      activeFn = next;
      // Without this the next read is served from the cache the real
      // implementation filled, and the override silently does nothing.
      invalidateAll();
      onOverride(() => {
        activeFn = fn;
        invalidateAll();
      });
    },
    snapshot() {
      return cache$.value;
    },
  };
}

export const createQueryResource = <Params>({ key }: { key: KeyFn<Params> }) => {
  type QueryResourceBuilder<Response, Cache> = {
    request<Response>(fn: RequestFn<Params, Response>): QueryResourceBuilder<Response, Cache>;
    timeout(timeout: number): QueryResourceBuilder<Response, Cache>;
    retry(retry: NonNullable<QueryParams<Params, Response, Cache>>['retry']): QueryResourceBuilder<Response, Cache>;
    cache<Cache>(cache: NonNullable<QueryParams<Params, Response, Cache>['cache']>): QueryResourceBuilder<Response, Cache>;
    build(): Resource<Params, Response, CacheOrDefault<Cache, Response>> & Overridable<RequestFn<Params, Response>>;
  };

  const internal = <Response = never, Cache = never>(
    params: Partial<QueryParams<Params, Response, Cache>> = {},
  ): QueryResourceBuilder<Response, Cache> => {
    return {
      request<Response>(fn: RequestFn<Params, Response>) {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return internal<Response, Cache>({ ...params, fn, key } as Partial<QueryParams<Params, Response, Cache>>);
      },
      timeout(timeout) {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return internal<Response, Cache>({ ...params, timeout } as Partial<QueryParams<Params, Response, Cache>>);
      },
      retry(retry) {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return internal<Response, Cache>({ ...params, retry } as Partial<QueryParams<Params, Response, Cache>>);
      },
      cache<Cache>(cache: NonNullable<QueryParams<Params, Response, Cache>['cache']>) {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        return internal<Response, Cache>({ ...params, cache } as Partial<QueryParams<Params, Response, Cache>>);
      },
      build() {
        if (!params.fn) {
          throw new Error('Missing request function');
        }

        if (params.cache) {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          return build<Params, Response, Cache>({
            cache: params.cache,
            key,
            retry: params.retry,
            timeout: params.timeout,
            fn: params.fn,
          }) as Resource<Params, Response, CacheOrDefault<Cache, Response>> & Overridable<RequestFn<Params, Response>>;
        } else {
          const initial = createDefaultInitial<Response>();
          const cacheMapper = createDefaultCacheMapper<Params, Response>(wrapKeyFactory(key));

          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          return build<Params, Response, DefaultCache<Response>>({
            cache: {
              initial,
              map: cacheMapper,
            },
            key,
            retry: params.retry,
            timeout: params.timeout,
            fn: params.fn,
          }) as Resource<Params, Response, CacheOrDefault<Cache, Response>> & Overridable<RequestFn<Params, Response>>;
        }
      },
    };
  };

  return internal();
};
