import fs from 'node:fs';
import path from 'node:path';

const resourceSavingView = path.join(
  process.cwd(),
  'node_modules/@react-navigation/elements/lib/module/ResourceSavingView.js',
);

if (!fs.existsSync(resourceSavingView)) {
  process.exit(0);
}

const marker = "display: visible ? 'flex' : 'none',\n        pointerEvents:";
let source = fs.readFileSync(resourceSavingView, 'utf8');

if (source.includes(marker)) {
  process.exit(0);
}

source = source.replace(
  `style: [{
        display: visible ? 'flex' : 'none'
      }, styles.container, style],
      pointerEvents: visible ? 'auto' : 'none',`,
  `style: [{
        display: visible ? 'flex' : 'none',
        pointerEvents: visible ? 'auto' : 'none',
      }, styles.container, style],`,
);

source = source.replace(
  `style: [styles.container, style]
    // box-none doesn't seem to work properly on Android
    ,
    pointerEvents: visible ? 'auto' : 'none',
    children:`,
  `style: [styles.container, style, { pointerEvents: visible ? 'auto' : 'none' }],
    children:`,
);

source = source.replace(
  `Platform.OS === 'ios' || Platform.OS === 'macos' ? !visible : true,
      pointerEvents: visible ? 'auto' : 'none',
      style: visible ? styles.attached : styles.detached,`,
  `Platform.OS === 'ios' || Platform.OS === 'macos' ? !visible : true,
      style: visible ? styles.attached : styles.detached,`,
);

source = source.replace(
  `attached: {
    flex: 1
  },
  detached: {
    flex: 1,
    top: FAR_FAR_AWAY
  }`,
  `attached: {
    flex: 1,
    pointerEvents: 'auto'
  },
  detached: {
    flex: 1,
    top: FAR_FAR_AWAY,
    pointerEvents: 'none'
  }`,
);

fs.writeFileSync(resourceSavingView, source);
console.log('Patched @react-navigation/elements ResourceSavingView pointerEvents');
