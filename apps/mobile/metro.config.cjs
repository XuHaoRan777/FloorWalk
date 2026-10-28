const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
if (process.env.FW_SLOT) {
  const slot = Number(process.env.FW_SLOT);
  if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
    throw new Error('FW_SLOT 必须是 1、2 或 3。');
  }
  const cacheRoot = path.join(__dirname, '.expo/web/cache', `slot-${slot}`);
  // Preserve Expo's binary store while separating --clear and file-map writes.
  const ExpoFileStore = config.cacheStores[0].constructor;
  config.cacheStores = [
    new ExpoFileStore({ root: path.join(cacheRoot, 'transform') }),
  ];
  config.fileMapCacheDirectory = path.join(cacheRoot, 'file-map');
}

module.exports = withNativewind(config, { inlineRem: 16 });
