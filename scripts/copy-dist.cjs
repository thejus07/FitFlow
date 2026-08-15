const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../apps/web/dist');
const dest = path.resolve(__dirname, '../dist');

if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('Successfully copied apps/web/dist to ./dist');
} else {
  console.error('Error: apps/web/dist does not exist');
  process.exit(1);
}
