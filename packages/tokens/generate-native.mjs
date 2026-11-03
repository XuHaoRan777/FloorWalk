import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

// tokens.css is the source; native.json is its generated React Native adapter.
// Keep 16 in sync with NativeWind's inlineRem in apps/mobile/metro.config.cjs.
const remSize = 16;
const source = await readFile(new URL('./tokens.css', import.meta.url), 'utf8');
const lightTheme = source.slice(0, source.indexOf(':root.dark'));
const values = new Map(
  [...lightTheme.matchAll(/--fw-([\w-]+):\s*([^;]+);/g)].map((match) => [
    match[1],
    match[2].trim(),
  ]),
);

function dimension(name) {
  const value = values.get(name);
  const rem = value?.match(/^([\d.]+)rem$/);
  if (rem) return Number(rem[1]) * remSize;
  const reference = value?.match(/^var\(--fw-([\w-]+)\)$/);
  if (reference) return dimension(reference[1]);
  const product = value?.match(/^calc\(var\(--fw-([\w-]+)\) \* ([\d.]+)\)$/);
  if (product) return dimension(product[1]) * Number(product[2]);
  throw new Error(`Unsupported native dimension: --fw-${name}`);
}

// These are platform font registrations, selected by the shared family tokens.
const fontRegistrations = {
  'IBM Plex Sans': {
    regular: 'IBMPlexSans_400Regular',
    medium: 'IBMPlexSans_500Medium',
    semibold: 'IBMPlexSans_600SemiBold',
  },
  'IBM Plex Mono': { regular: 'IBMPlexMono_400Regular' },
};

function font(name) {
  const family = values.get(`font-${name}`)?.split(',')[0].replaceAll("'", '');
  const registration = fontRegistrations[family];
  if (!registration) {
    throw new Error(`Register the shared font on native: ${family}`);
  }
  return registration;
}

const nativeTokens = {
  font: { sans: font('sans'), mono: font('mono') },
  radius: Object.fromEntries(
    ['control', 'card', 'sheet'].map((name) => [
      name,
      dimension(`radius-${name}`),
    ]),
  ),
  space: Object.fromEntries(
    ['unit', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'].map((name) => [
      name,
      dimension(`space-${name}`),
    ]),
  ),
};
const output = `${JSON.stringify(nativeTokens, null, 2)}\n`;
const destination = new URL('./native.json', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(destination, 'utf8')) !== output) {
    throw new Error(
      'Regenerate native tokens: node packages/tokens/generate-native.mjs',
    );
  }
} else {
  await writeFile(destination, output);
}
