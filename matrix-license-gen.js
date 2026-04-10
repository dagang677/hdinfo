/**
 * MATRIX 授权制作工具 (Manufacturer Only)
 * 用于为不同项目、不同客户生成唯一的加密授权队
 */
const crypto = require('crypto');

const MASTER_KEY = "MATRIX_MASTER_2026"; // 必须与 server.js 保持一致

/**
 * 生成授权密文
 * @param {string} projectName 项目/客户名称
 * @param {string} expiry 到期日期 (YYYY-MM-DD)
 * @param {number} quota 终端数量配额
 * @param {string} secret 该项目的通信主密钥 (建议随机生成)
 */
function generateLicense(projectName, expiry, quota, secret) {
    const payload = `${projectName}:${expiry}:${quota}:${secret}`;
    const payloadB64 = Buffer.from(payload).toString('base64');

    // 生成数字签名，防止篡改
    const sig = crypto.createHmac('sha256', MASTER_KEY)
        .update(payloadB64)
        .digest('hex')
        .substring(0, 16);

    return `${sig}|${payloadB64}`;
}

// --- 示例生成过程 ---
console.log("=========================================");
console.log("MATRIX 离线授权生成工具 v1.0");
console.log("=========================================");

const testLicense = generateLicense(
    "南京XX展厅项目",
    "2026-12-31",
    50,
    "SEC_NJ_8899"
);

console.log("\n生成结果 (请将此密文发给客户):");
console.log("-----------------------------------------");
console.log(testLicense);
console.log("-----------------------------------------");
console.log("\n项目名称: 南京XX展厅项目");
console.log("有效期至: 2026-12-31");
console.log("终端限额: 50 台");
console.log("通信密钥: SEC_NJ_8899");
console.log("=========================================");
