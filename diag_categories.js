const fs = require('fs');
const path = require('path');
const CATEGORIES_FILE = path.join(__dirname, 'matrix_storage', 'categories.json');
try {
    if (fs.existsSync(CATEGORIES_FILE)) {
        console.log('CONTENT:', fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
    } else {
        console.log('FILE NOT FOUND');
    }
} catch (e) {
    console.error(e);
}
