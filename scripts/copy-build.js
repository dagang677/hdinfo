const fs = require('fs');
const path = require('path');

function copyFileSync(source, target) {
    let targetFile = target;
    if (fs.existsSync(target) && fs.lstatSync(target).isDirectory()) {
        targetFile = path.join(target, path.basename(source));
    }
    fs.writeFileSync(targetFile, fs.readFileSync(source));
    console.log(`Copied: ${source} -> ${targetFile}`);
}

function copyFolderRecursiveSync(source, target) {
    let files = [];
    const targetFolder = path.join(target, path.basename(source));
    if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
    }

    if (fs.lstatSync(source).isDirectory()) {
        files = fs.readdirSync(source);
        files.forEach(function (file) {
            const curSource = path.join(source, file);
            if (fs.lstatSync(curSource).isDirectory()) {
                copyFolderRecursiveSync(curSource, targetFolder);
            } else {
                copyFileSync(curSource, targetFolder);
            }
        });
    }
}

// 执行同步任务
const items = [
    { src: 'server.js', dest: 'server-host/' },
    { src: 'terminal.html', dest: 'server-host/' },
    { src: 'dist', dest: 'server-host/', isDir: true },
    { src: 'dist', dest: 'terminal-player/', isDir: true }, // 新增：同步到播放器目录实现离线化
    { src: 'icon.png', dest: 'server-host/' },
    { src: 'icon.ico', dest: 'server-host/' }
];

console.log('🚀 Starting built assets synchronization...');

items.forEach(item => {
    const srcPath = path.resolve(__dirname, '..', item.src);
    const destPath = path.resolve(__dirname, '..', item.dest);

    if (!fs.existsSync(srcPath)) {
        console.warn(`Warning: Source not found (skipping): ${srcPath}`);
        return;
    }

    if (item.isDir) {
        // 先清理目标目录中的旧 dist
        const targetDist = path.join(destPath, 'dist');
        if (fs.existsSync(targetDist)) {
            fs.rmSync(targetDist, { recursive: true, force: true });
        }
        copyFolderRecursiveSync(srcPath, destPath);
    } else {
        copyFileSync(srcPath, destPath);
    }
});

console.log('✅ Sync completed.');
