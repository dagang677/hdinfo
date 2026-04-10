const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const versionParts = pkg.version.split('.');
// 递增修订版本号 (1.0.x -> 1.0.x+1)
versionParts[2] = parseInt(versionParts[2]) + 1;
pkg.version = versionParts.join('.');

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 4));
console.log(`[Version Bump] New version: ${pkg.version}`);
