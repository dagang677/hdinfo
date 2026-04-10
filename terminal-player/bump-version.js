/**
 * 自动递增版本号：小版本号 (patch) 每次构建自动 +1
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const versionParts = pkg.version.split('.').map(Number);
versionParts[2] += 1;
pkg.version = versionParts.join('.');

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
console.log(`\x1b[36m[System] Version bumped to ${pkg.version}\x1b[0m`);
