import { dotNsService, isLocalhostUrl, normalizeLocalhostUrl, parseLocalhostUrl } from './service';

// Every TLD-taking helper is exercised under two networks, so a
// suffix that leaked back into the implementation fails on the second one.
describe.each(['.dot', '.paseo'])('dotNS name helpers on %s', tld => {
  describe('baseNameOf', () => {
    test('appends the TLD to a bare label', () => {
      expect(dotNsService.baseNameOf('hackm3', tld)).toBe(`hackm3${tld}`);
    });

    test('returns full base names unchanged', () => {
      expect(dotNsService.baseNameOf(`hackm3${tld}`, tld)).toBe(`hackm3${tld}`);
    });

    test('lowercases the input', () => {
      expect(dotNsService.baseNameOf(`HACKm3${tld.toUpperCase()}`, tld)).toBe(`hackm3${tld}`);
    });

    test('trims whitespace', () => {
      expect(dotNsService.baseNameOf(`  hackm3${tld}  `, tld)).toBe(`hackm3${tld}`);
    });
  });

  describe('isSameBaseName', () => {
    test('matches case variants of the same name', () => {
      expect(dotNsService.isSameBaseName(`Hackm3${tld}`, `hackm3${tld}`, tld)).toBe(true);
    });

    test('matches a raw identifier against its normalized base name', () => {
      expect(dotNsService.isSameBaseName('localhost:5173', `localhost:5173${tld}`, tld)).toBe(true);
    });

    test('rejects different names', () => {
      expect(dotNsService.isSameBaseName(`alpha${tld}`, `beta${tld}`, tld)).toBe(false);
    });
  });

  describe('toDisplayName', () => {
    test('strips a trailing TLD', () => {
      expect(dotNsService.toDisplayName(`hackm3${tld}`, tld)).toBe('hackm3');
    });

    test('leaves a name without a trailing TLD unchanged', () => {
      expect(dotNsService.toDisplayName('HackM3', tld)).toBe('HackM3');
    });

    test('only strips the final TLD, not the gateway suffix', () => {
      expect(dotNsService.toDisplayName(`hackm3${tld}.li`, tld)).toBe(`hackm3${tld}.li`);
    });

    test('leaves another network TLD alone', () => {
      expect(dotNsService.toDisplayName('hackm3.example', tld)).toBe('hackm3.example');
    });
  });

  describe('toShortLabel', () => {
    test('keeps a name within the length cap as-is', () => {
      expect(dotNsService.toShortLabel(`a${tld}`, tld)).toBe(`a${tld}`);
    });

    test('truncates a long name with an ellipsis', () => {
      expect(dotNsService.toShortLabel(`verylongproduct${tld}`, tld)).toBe('verylongpr...');
    });

    test('honours a custom max length', () => {
      expect(dotNsService.toShortLabel(`hackm3${tld}`, tld, 4)).toBe('hack...');
    });
  });

  describe('isDotDomain', () => {
    test('returns true for a name under the network TLD', () => {
      expect(dotNsService.isDotDomain(`mytestapp${tld}`, tld)).toBe(true);
    });

    test('returns true for the gateway alias', () => {
      expect(dotNsService.isDotDomain(`mytestapp${tld}.li`, tld)).toBe(true);
    });

    test('returns false for an unrelated domain', () => {
      expect(dotNsService.isDotDomain('example.com', tld)).toBe(false);
    });

    test('returns false for another network TLD', () => {
      expect(dotNsService.isDotDomain('mytestapp.example', tld)).toBe(false);
    });
  });

  describe('isProductIdentifier', () => {
    test('accepts a name under the network TLD', () => {
      expect(dotNsService.isProductIdentifier(`mytestapp${tld}`, tld)).toBe(true);
    });

    test('accepts a localhost identifier', () => {
      expect(dotNsService.isProductIdentifier('localhost:3000', tld)).toBe(true);
    });

    test('rejects an unrelated domain', () => {
      expect(dotNsService.isProductIdentifier('example.com', tld)).toBe(false);
    });
  });

  describe('parseDotNsDomain', () => {
    test('parses a bare name', () => {
      expect(dotNsService.parseDotNsDomain(`mytestapp${tld}`, tld)).toEqual({
        identifier: `mytestapp${tld}`,
        pathname: '',
      });
    });

    test('collapses the bare gateway alias', () => {
      expect(dotNsService.parseDotNsDomain(`mytestapp${tld}.li`, tld)).toEqual({
        identifier: `mytestapp${tld}`,
        pathname: '',
      });
    });

    test('parses a name with https protocol', () => {
      expect(dotNsService.parseDotNsDomain(`https://mytestapp${tld}`, tld)).toEqual({
        identifier: `mytestapp${tld}`,
        pathname: '',
      });
    });

    test('parses a name with http protocol', () => {
      expect(dotNsService.parseDotNsDomain(`http://mytestapp${tld}`, tld)).toEqual({
        identifier: `mytestapp${tld}`,
        pathname: '',
      });
    });

    test('parses a name with pathname', () => {
      expect(dotNsService.parseDotNsDomain(`mytestapp${tld}/some/path`, tld)).toEqual({
        identifier: `mytestapp${tld}`,
        pathname: 'some/path',
      });
    });

    test('collapses the gateway alias with pathname', () => {
      expect(dotNsService.parseDotNsDomain(`mytestapp${tld}.li/some/path`, tld)).toEqual({
        identifier: `mytestapp${tld}`,
        pathname: 'some/path',
      });
    });

    test('parses a query on host only (no path segment before ?)', () => {
      expect(dotNsService.parseDotNsDomain(`pr508.faucet${tld}?embed=1`, tld)).toEqual({
        identifier: `pr508.faucet${tld}`,
        pathname: '?embed=1',
      });
    });

    test('parses https with a query on host only', () => {
      expect(dotNsService.parseDotNsDomain(`https://pr508.faucet${tld}?embed=1`, tld)).toEqual({
        identifier: `pr508.faucet${tld}`,
        pathname: '?embed=1',
      });
    });

    test('parses a hash on host only', () => {
      expect(dotNsService.parseDotNsDomain(`pr508.faucet${tld}#section=main`, tld)).toEqual({
        identifier: `pr508.faucet${tld}`,
        pathname: '#section=main',
      });
    });

    test('parses pathname, query and hash together', () => {
      expect(dotNsService.parseDotNsDomain(`pr508.faucet${tld}/nested/path?embed=1#frame=compact`, tld)).toEqual({
        identifier: `pr508.faucet${tld}`,
        pathname: 'nested/path?embed=1#frame=compact',
      });
    });

    test('parses a name from a polkadot:// URL host', () => {
      expect(dotNsService.parseDotNsDomain(`polkadot://currenthost${tld}/mytestapp${tld}`, tld)).toEqual({
        identifier: `currenthost${tld}`,
        pathname: `mytestapp${tld}`,
      });
    });

    test('collapses the gateway alias in a polkadot:// URL host', () => {
      expect(dotNsService.parseDotNsDomain(`polkadot://currenthost${tld}.li/mytestapp${tld}`, tld)).toEqual({
        identifier: `currenthost${tld}`,
        pathname: `mytestapp${tld}`,
      });
    });

    test('parses a polkadot:// URL with a nested path', () => {
      expect(dotNsService.parseDotNsDomain(`polkadot://currenthost${tld}/mytestapp${tld}/settings`, tld)).toEqual({
        identifier: `currenthost${tld}`,
        pathname: `mytestapp${tld}/settings`,
      });
    });

    test('parses a polkadot:// URL with query and hash', () => {
      expect(dotNsService.parseDotNsDomain(`polkadot://currenthost${tld}/mytestapp${tld}?embed=1#frame=compact`, tld)).toEqual({
        identifier: `currenthost${tld}`,
        pathname: `mytestapp${tld}?embed=1#frame=compact`,
      });
    });

    test('parses a polkadot:// URL with a regular path', () => {
      expect(dotNsService.parseDotNsDomain(`polkadot://currenthost${tld}/settings`, tld)).toEqual({
        identifier: `currenthost${tld}`,
        pathname: 'settings',
      });
    });

    test('returns null for a polkadot:// URL whose host is not under the TLD', () => {
      expect(dotNsService.parseDotNsDomain('polkadot://example.com/settings', tld)).toBeNull();
    });

    test('returns null for an unrelated domain', () => {
      expect(dotNsService.parseDotNsDomain('example.com', tld)).toBeNull();
    });

    test('returns null for a name under another network TLD', () => {
      expect(dotNsService.parseDotNsDomain('mytestapp.example', tld)).toBeNull();
    });

    test('returns null when pathname contains parentheses (router-unsafe)', () => {
      expect(dotNsService.parseDotNsDomain(`localdot${tld}/foo(bar`, tld)).toBeNull();
      expect(dotNsService.parseDotNsDomain(`localdot${tld}/(`, tld)).toBeNull();
    });

    test('returns null when pathname contains spaces (encoded or not)', () => {
      expect(dotNsService.parseDotNsDomain(`localdot${tld}/ (`, tld)).toBeNull();
    });

    test('returns null for invalid percent-encoding in pathname', () => {
      expect(dotNsService.parseDotNsDomain(`mytestapp${tld}/bad%`, tld)).toBeNull();
      expect(dotNsService.parseDotNsDomain(`mytestapp${tld}/bad%zz`, tld)).toBeNull();
    });
  });
});

describe('subnameOf', () => {
  test('prepends the label to the base name', () => {
    expect(dotNsService.subnameOf('hackm3.dot', 'app')).toBe('app.hackm3.dot');
  });

  test('produces widget subname', () => {
    expect(dotNsService.subnameOf('hackm3.dot', 'widget')).toBe('widget.hackm3.dot');
  });

  test('produces worker subname', () => {
    expect(dotNsService.subnameOf('hackm3.dot', 'worker')).toBe('worker.hackm3.dot');
  });
});

describe('generateProductBase', () => {
  test('builds a polkadot:// origin', () => {
    expect(dotNsService.generateProductBase('app.hackm3.dot')).toBe('polkadot://app.hackm3.dot');
  });

  test('encodes each path segment', () => {
    expect(dotNsService.generateProductBase('a b/c d')).toBe('polkadot://a%20b/c%20d');
  });
});

describe('isLocalhostUrl', () => {
  test('matches localhost without protocol', () => {
    expect(isLocalhostUrl('localhost:3000')).toBe(true);
  });

  test('matches localhost with http protocol', () => {
    expect(isLocalhostUrl('http://localhost:3000')).toBe(true);
  });

  test('matches localhost without port', () => {
    expect(isLocalhostUrl('localhost')).toBe(true);
  });

  test('rejects non-localhost URLs', () => {
    expect(isLocalhostUrl('example.com')).toBe(false);
    expect(isLocalhostUrl('https://example.com')).toBe(false);
  });
});

describe('normalizeLocalhostUrl', () => {
  test('prepends http:// when missing', () => {
    expect(normalizeLocalhostUrl('localhost:3000')).toBe('http://localhost:3000');
  });

  test('keeps existing http://', () => {
    expect(normalizeLocalhostUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });
});

describe('parseLocalhostUrl', () => {
  test('parses localhost with port', () => {
    expect(parseLocalhostUrl('localhost:3000')).toEqual({
      identifier: 'localhost:3000',
      pathname: '',
    });
  });

  test('parses localhost with pathname', () => {
    expect(parseLocalhostUrl('localhost:3000/n')).toEqual({
      identifier: 'localhost:3000',
      pathname: 'n',
    });
  });

  test('preserves query parameters', () => {
    expect(parseLocalhostUrl('localhost:3000/n?id=doc-123')).toEqual({
      identifier: 'localhost:3000',
      pathname: 'n?id=doc-123',
    });
  });

  test('preserves hash fragment', () => {
    expect(parseLocalhostUrl('localhost:3000/n#key=abc')).toEqual({
      identifier: 'localhost:3000',
      pathname: 'n#key=abc',
    });
  });

  test('preserves query parameters and hash fragment together', () => {
    const url = 'localhost:3000/n?id=doc-1769102172266-u4n7nz09j#key=1jPCSPzj2f_h9Jn3mDo-Vw&pk=84b56c19aa2098440f8a';
    expect(parseLocalhostUrl(url)).toEqual({
      identifier: 'localhost:3000',
      pathname: 'n?id=doc-1769102172266-u4n7nz09j#key=1jPCSPzj2f_h9Jn3mDo-Vw&pk=84b56c19aa2098440f8a',
    });
  });

  test('works with http:// prefix', () => {
    expect(parseLocalhostUrl('http://localhost:3000/path?q=1#h=2')).toEqual({
      identifier: 'localhost:3000',
      pathname: 'path?q=1#h=2',
    });
  });

  test('returns null for non-localhost URLs', () => {
    expect(parseLocalhostUrl('https://example.com')).toBeNull();
  });

  test('returns null for invalid URLs', () => {
    expect(parseLocalhostUrl('not a url at all')).toBeNull();
  });
});
