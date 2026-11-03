import { describe, expect, it } from 'vitest';
import { getAllowedOrigins } from './cors-config.js';

describe('CORS allowed origins', () => {
  it('adds local Web and Expo IPv4 origins only in unslotted development', () => {
    const origins = getAllowedOrigins(
      {
        NODE_ENV: 'development',
        CORS_ORIGINS: 'https://console.example',
      },
      {
        ethernet: [
          {
            address: '192.168.1.8',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: false,
            cidr: '192.168.1.8/24',
          },
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true,
            cidr: '127.0.0.1/8',
          },
          {
            address: 'fe80::1',
            netmask: 'ffff:ffff:ffff:ffff::',
            family: 'IPv6',
            mac: '00:00:00:00:00:00',
            scopeid: 1,
            internal: false,
            cidr: 'fe80::1/64',
          },
        ],
      },
    );
    expect([...origins].sort()).toEqual(
      [
        'http://192.168.1.8:3019',
        'http://192.168.1.8:3020',
        'https://console.example',
      ].sort(),
    );
  });

  it.each([
    { env: { NODE_ENV: 'production' }, mode: 'production' },
    {
      env: { NODE_ENV: 'development', FW_SLOT: '1' },
      mode: 'slotted development',
    },
  ])('does not add local origins in $mode', ({ env }) => {
    const origins = getAllowedOrigins(env, {
      ethernet: [
        {
          address: '192.168.1.8',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: '192.168.1.8/24',
        },
      ],
    });
    expect([...origins]).toEqual([]);
  });
});
