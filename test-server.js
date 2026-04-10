const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3003;

const STORAGE_ROOT = path.join(__dirname, 'matrix_storage');

if (!fs.existsSync(STORAGE_ROOT)) {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
}

// 配置CORS
const corsOptions = {
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 测试路由
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// 物理快照接口
app.post('/api/terminals/snapshot', (req, res) => {
  const { terminalId, imageBase64 } = req.body;
  if (!terminalId || !imageBase64) return res.status(400).send('Missing data');
  
  try {
    const SNAPSHOTS_DIR = path.join(STORAGE_ROOT, '_snapshots');
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    }
    
    const base64Data = imageBase64.replace(/^data:image\/jpeg;base64,/, "");
    const filePath = path.join(SNAPSHOTS_DIR, `${terminalId}.jpg`);
    fs.writeFileSync(filePath, base64Data, 'base64');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/terminals/snapshot', (req, res) => {
  const { id } = req.query;
  const SNAPSHOTS_DIR = path.join(STORAGE_ROOT, '_snapshots');
  const filePath = path.join(SNAPSHOTS_DIR, `${id}.jpg`);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('No Snapshot');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TEST SERVER ACTIVE ON PORT ${PORT}`);
});
