import { networkInterfaces } from 'node:os';

export function getAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
  interfaces = networkInterfaces(),
) {
  const origins = new Set(
    (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  if (env.NODE_ENV === 'development' && !env.FW_SLOT) {
    for (const addresses of Object.values(interfaces))
      for (const address of addresses ?? [])
        if (!address.internal && address.family === 'IPv4')
          for (const port of [3019, 3020])
            origins.add(`http://${address.address}:${port}`);
  }
  return origins;
}
