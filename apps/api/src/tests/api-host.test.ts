import { describe, expect, it } from 'vitest';
import { getApiListenHost } from '../config/api-host.js';

describe('API listen host', () => {
  it('keeps the managed local API on loopback', () => {
    expect(
      getApiListenHost({ NODE_ENV: 'development', HOST: '127.0.0.1' }, [
        'node',
        'dist/main.js',
        '--loopback',
      ]),
    ).toBe('127.0.0.1');
  });

  it('keeps the regular development API reachable from the local network', () => {
    expect(
      getApiListenHost({ NODE_ENV: 'development', HOST: '127.0.0.1' }, []),
    ).toBe('0.0.0.0');
  });

  it('preserves explicit non-loopback development hosts', () => {
    expect(
      getApiListenHost({ NODE_ENV: 'development', HOST: '192.168.1.8' }, []),
    ).toBe('192.168.1.8');
  });

  it('uses the configured host outside unslotted development', () => {
    expect(
      getApiListenHost(
        { NODE_ENV: 'development', FW_SLOT: '1', HOST: '127.0.0.1' },
        [],
      ),
    ).toBe('127.0.0.1');
    expect(getApiListenHost({ NODE_ENV: 'production' }, [])).toBe('127.0.0.1');
  });
});
