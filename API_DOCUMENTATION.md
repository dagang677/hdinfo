# 后端存储节点 API 文档

## 1. 概述

本文档描述了后端存储节点提供的API接口，用于前端上传、下载、删除和管理素材文件。

## 2. 基本信息

- **服务器地址**：http://0.0.0.0:3000
- **支持的请求方法**：GET, POST, DELETE, OPTIONS, PUT
- **CORS**：支持跨域请求，允许所有来源
- **存储目录**：D:/DMS_Assets
- **临时上传目录**：temp_uploads/{fileHash}/

## 3. API 接口

### 3.1 核心握手接口

#### GET /api/assets

**描述**：获取存储目录中的文件列表，用于前端展示素材列表。

**请求参数**：无

**响应格式**：
```json
[
  {
    "name": "文件名",
    "size": 文件大小（字节）
  }
]
```

**示例响应**：
```json
[
  {
    "name": "video.mp4",
    "size": 1024000
  },
  {
    "name": "image.jpg",
    "size": 512000
  }
]
```

**错误响应**：
```json
{
  "error": "错误信息"
}
```

### 3.2 文件删除接口

#### DELETE /api/assets/delete

**描述**：删除指定的文件。

**请求参数**：
- **请求体**（JSON格式）：
  - `filename`：要删除的文件名（必填，二选一）
  - `filePath`：要删除的文件完整路径（必填，二选一）

**响应格式**：
- 成功响应：
```json
{
  "success": true,
  "message": "File deleted successfully",
  "filePath": "删除的文件路径"
}
```

- 失败响应（HTTP状态码500）：
```json
{
  "error": "错误信息",
  "filePath": "尝试删除的文件路径",
  "code": "错误代码"
}
```

**示例请求**：
```
DELETE /api/assets/delete
Content-Type: application/json

{
  "filename": "video.mp4"
}
```

### 3.3 统一流式接口

#### GET /api/assets/stream

**描述**：流式获取指定文件的内容，用于前端预览或播放素材。

**请求参数**：
- **查询参数**：
  - `filename`：要获取的文件名（必填）

**响应格式**：
- 成功响应：
  - HTTP状态码：200
  - Content-Type：根据文件类型自动设置
  - Content-Length：文件大小
  - 响应体：文件的二进制内容

- 失败响应：
```json
{
  "error": "错误信息"
}
```

**示例请求**：
```
GET /api/assets/stream?filename=video.mp4
```

### 3.4 断点续传检查接口

#### GET /upload/check

**描述**：检查文件是否已经存在或已上传部分分片，用于断点续传。

**请求参数**：
- **查询参数**：
  - `fileHash`：文件的哈希值（必填）
  - `fileName`：文件名（可选）

**响应格式**：
- 文件已存在：
```json
{
  "exists": true,
  "message": "File already exists (instant upload)",
  "filePath": "文件存储路径"
}
```

- 文件不存在：
```json
{
  "exists": false,
  "uploadedChunks": [已上传的分片索引数组]
}
```

**示例请求**：
```
GET /upload/check?fileHash=1234567890abcdef&fileName=video.mp4
```

### 3.5 接收二进制分片

#### POST /upload/chunk

**描述**：接收文件的二进制分片，用于大文件上传。

**请求参数**：
- **查询参数**：
  - `chunkIndex`：分片索引（必填）
  - `fileHash`：文件的哈希值（必填，或通过请求头传递）
  - `fileName`：文件名（可选，或通过请求头传递）

- **请求头**：
  - `fileHash`：文件的哈希值（必填，或通过查询参数传递）
  - `fileName`：文件名（可选，或通过查询参数传递）
  - `Content-Type`：
    - `multipart/form-data`：用于FormData格式上传
    - `application/octet-stream`：用于直接二进制上传

- **请求体**：
  - FormData格式：包含名为"file"的文件字段
  - 直接二进制格式：分片的二进制内容

**响应格式**：
```json
{
  "success": true,
  "message": "Chunk {chunkIndex} uploaded successfully",
  "chunkIndex": 分片索引,
  "size": 分片大小（字节）
}
```

**示例请求**（FormData格式）：
```
POST /upload/chunk?chunkIndex=0&fileHash=1234567890abcdef
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="video.mp4"
Content-Type: video/mp4

[二进制文件内容]
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

### 3.6 触发分片合并

#### POST /upload/merge

**描述**：触发合并已上传的文件分片，生成最终的完整文件。

**请求参数**：
- **请求体**（JSON格式）：
  - `fileHash`：文件的哈希值（必填）
  - `fileName`：文件名（必填）
  - `targetPath`：文件的目标存储路径（可选，默认存储在根目录）

**响应格式**：
- 成功响应：
```json
{
  "success": true,
  "message": "File merged successfully",
  "filePath": "文件存储路径",
  "fileName": "文件名"
}
```

- 失败响应：
```json
{
  "error": "错误信息"
}
```

**示例请求**：
```
POST /upload/merge
Content-Type: application/json

{
  "fileHash": "1234567890abcdef",
  "fileName": "video.mp4",
  "targetPath": "videos/"
}
```

### 3.7 原始上传接口

#### POST /upload

**描述**：直接上传完整文件，适用于小文件上传。

**请求参数**：
- **请求头**：
  - `Content-Type`：multipart/form-data; boundary=xxx

- **请求体**：
  - FormData格式：包含名为"file"的文件字段

**响应格式**：
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "filePath": "文件存储路径",
  "fileName": "文件名"
}
```

**示例请求**：
```
POST /upload
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="file"; filename="image.jpg"
Content-Type: image/jpeg

[二进制文件内容]
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

## 4. 错误处理

### 4.1 常见错误码

| 错误码 | 描述 |
|--------|------|
| 400 | 请求参数错误 |
| 404 | 文件不存在 |
| 413 | 请求体过大（超过100MB） |
| 500 | 服务器内部错误 |

### 4.2 错误响应格式

所有错误响应均为JSON格式，包含`error`字段，描述错误信息：

```json
{
  "error": "错误信息"
}
```

## 5. CORS 配置

后端支持跨域请求，设置了以下CORS头：

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS, PUT`
- `Access-Control-Allow-Headers: Content-Type, Content-Length, fileHash, chunkIndex, fileName, totalSize, targetPath`
- `Access-Control-Expose-Headers: *`
- `Access-Control-Max-Age: 86400`（24小时）

## 6. 上传流程

### 6.1 大文件上传流程

1. 前端计算文件的哈希值（fileHash）
2. 调用`GET /upload/check`检查文件是否已存在或已上传部分分片
3. 如果文件已存在，直接返回上传成功
4. 如果文件部分上传，只上传未上传的分片
5. 调用`POST /upload/chunk`上传每个分片
6. 所有分片上传完成后，调用`POST /upload/merge`合并分片

### 6.2 小文件上传流程

1. 直接调用`POST /upload`上传完整文件
2. 服务器保存文件并返回上传成功

## 7. 注意事项

1. **文件大小限制**：单个请求的最大大小为100MB
2. **分片大小**：建议每个分片大小为10MB
3. **文件名**：建议使用唯一的文件名，避免覆盖现有文件
4. **文件哈希**：建议使用SHA-1或MD5算法计算文件哈希值
5. **错误处理**：前端应妥善处理服务器返回的错误，特别是500错误，建议进行重试
6. **并发控制**：服务器已实现分片锁机制，避免并发上传同一分片导致的数据损坏

## 8. 临时存储结构

大文件上传时，分片临时存储在`temp_uploads/{fileHash}/`目录下，文件名格式为`{chunkIndex}.part`。合并完成后，临时文件和目录会被删除。

## 9. 安全考虑

1. 建议在生产环境中限制允许的来源，不要使用`*`
2. 建议添加身份验证和授权机制
3. 建议对上传的文件进行病毒扫描
4. 建议定期清理临时上传目录

## 10. 版本信息

- **版本**：1.0.0
- **更新时间**：2026-01-24
- **更新内容**：
  - 初始版本
  - 支持大文件分片上传
  - 支持断点续传
  - 支持文件删除
  - 支持流式文件获取
  - 支持核心握手接口
  - 增强CORS配置
  - 优化错误处理和日志记录