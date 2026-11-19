export function getApiListenHost(
  env: NodeJS.ProcessEnv = process.env,
  args: string[] = process.argv,
) {
  if (args.includes('--loopback')) return '127.0.0.1';

  const isLocalDevelopment = env.NODE_ENV === 'development' && !env.FW_SLOT;
  const configuredHost = env.HOST;
  return isLocalDevelopment &&
    (!configuredHost || ['127.0.0.1', 'localhost'].includes(configuredHost))
    ? '0.0.0.0'
    : (configuredHost ?? '127.0.0.1');
}
