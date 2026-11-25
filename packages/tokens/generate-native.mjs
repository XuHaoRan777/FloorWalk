import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

// tokens.css is the source; native.json is its generated React Native adapter.
// Keep 16 in sync with NativeWind's inlineRem in apps/mobile/metro.config.cjs.
const remSize = 16;
const source = await readFile(new URL('./tokens.css', import.meta.url), 'utf8');
const values = new Map(
  [...source.matchAll(/--fw-([\w-]+):\s*([^;]+);/g)].map((match) => [
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
  'LXGW WenKai GB': { regular: 'LXGWWenKaiGB-Regular' },
};

const colorNames = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'border',
  'input',
  'ring',
  'ground',
  'surface',
  'raised',
  'active',
  'rule',
  'positive-background',
  'positive-foreground',
  'negative-background',
  'negative-foreground',
  'warning-background',
  'neutral-background',
  'neutral-foreground',
  'chart-1',
  'chart-2',
  'chart-3',
];

function color(name) {
  const value = values.get(name);
  if (!value || !/^#[\da-f]{6}$/i.test(value)) {
    throw new Error(`Unsupported native color: --fw-${name}`);
  }
  return value;
}

function font(name) {
  const token =
    name === 'mobile-display' ? 'mobile-font-display' : `font-${name}`;
  const family = values.get(token)?.split(',')[0].replaceAll("'", '');
  const registration = fontRegistrations[family];
  if (!registration) {
    throw new Error(`Register the shared font on native: ${family}`);
  }
  return registration;
}

const nativeTokens = {
  colors: Object.fromEntries(
    colorNames.map((name) => [
      name.replace(/-([a-z\d])/g, (_, letter) => letter.toUpperCase()),
      color(name),
    ]),
  ),
  mobile: Object.fromEntries(
    [
      'background',
      'surface',
      'foreground',
      'muted-foreground',
      'border',
      'input',
      'primary',
      'primary-pressed',
      'primary-soft',
      'primary-text',
      'primary-tint',
      'route',
      'route-strong',
      'success',
      'success-text',
      'success-tint',
      'success-background',
      'warning',
      'warning-text',
      'warning-tint',
      'warning-background',
      'danger',
      'danger-text',
      'danger-tint',
      'danger-background',
      'change',
      'change-text',
      'change-tint',
      'pressed-background',
      'disabled',
      'disabled-background',
      'disabled-foreground',
      'overlay',
    ].map((name) => [
      name.replace(/-([a-z\d])/g, (_, letter) => letter.toUpperCase()),
      color(`mobile-${name}`),
    ]),
  ),
  mobileSpace: Object.fromEntries(
    [
      ['unit', 'unit'],
      ['xs', 'xs'],
      ['sm', 'sm'],
      ['md', 'md'],
      ['lg', 'lg'],
      ['xl', 'xl'],
      ['xxl', 'xxl'],
      ['xxxl', 'xxxl'],
      ['display', 'display'],
    ].map(([name, source]) => [
      name,
      dimension(`mobile-space-${source}`),
    ]),
  ),
  mobileRadius: Object.fromEntries(
    [
      ['control', 'control'],
      ['primary', 'primary'],
      ['card', 'card'],
      ['photo', 'photo'],
      ['large', 'large'],
      ['pill', 'pill'],
    ].map(([name, source]) => [
      name,
      dimension(`mobile-radius-${source}`),
    ]),
  ),
  mobileType: Object.fromEntries(
    ['xs', 'sm', 'base', 'lg', 'title', 'xl', '2xl', 'display'].map((name) => [
      name,
      dimension(`mobile-text-${name}`),
    ]),
  ),
  mobileShadow: {
    card: values.get('mobile-shadow-card'),
    focus: values.get('mobile-shadow-focus'),
  },
  mobileFont: { display: font('mobile-display') },
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
