const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5173;
const HOST = '0.0.0.0';
const PUBLIC_DIR = __dirname;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.jsx': 'application/javascript',
  '.ts': 'application/typescript',
  '.tsx': 'application/typescript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

  // 如果是目录，默认返回index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 Not Found</h1><p>The requested file does not exist.</p>');
    return;
  }

  // 检查文件是否是文件
  if (!fs.statSync(filePath).isFile()) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 Forbidden</h1><p>You do not have permission to access this resource.</p>');
    return;
  }

  // 获取文件扩展名
  const extname = path.extname(filePath);

  // 设置Content-Type
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  // 读取文件并发送
  fs.readFile(filePath, (err, content) => {
    if (err) {
      console.error(`[ERROR] Failed to read file: ${filePath}`, err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>500 Internal Server Error</h1><p>An error occurred while reading the file: ${err.message}</p>`);
      return;
    }

    console.log(`[INFO] Serving file: ${filePath} (${contentType})`);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Simple HTTP Server running at http://${HOST}:${PORT}`);
  console.log(`Serving files from: ${PUBLIC_DIR}`);
});