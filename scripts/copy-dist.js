const fs = require('fs');
const path = require('path');

const src = path.resolve('apps/web/dist');
const dist = path.resolve('dist');
const pub = path.resolve('public');

if (fs.existsSync(src)) {
  fs.mkdirSync(dist, { recursive: true });
  fs.mkdirSync(pub, { recursive: true });
  fs.cpSync(src, dist, { recursive: true });
  fs.cpSync(src, pub, { recursive: true });
  console.log('Successfully copied build output from apps/web/dist to ./dist and ./public');
} else {
  console.error('Error: Source directory apps/web/dist does not exist!');
  process.exit(1);
}
