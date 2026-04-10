const fs = require('fs');
const path = require('path');
const STORAGE_ROOT = path.join(__dirname, 'matrix_storage');
if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
const CATEGORIES_FILE = path.join(STORAGE_ROOT, 'categories.json');
try {
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify({ categories: ['DEBUG1', 'DEBUG2'], assetMap: {} }, null, 2));
    console.log('WRITE SUCCESS');
    console.log('CONTENT:', fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
} catch (e) {
    console.error('WRITE FAILED:', e);
}
