
/**
 * 从对象中获取不区分大小写的键值
 * @param headers 包含头信息的对象
 * @param key 需要获取的键名（不区分大小写）
 * @returns 匹配的值或 undefined
 */
export const getHeaderValue = (
  headers: Record<string, string> | Headers | undefined,
  key: string
): string | undefined => {
  if (!headers) return undefined;

  // 如果是原生的 Headers 对象，直接调用内置 get
  if (headers instanceof Headers) {
    return headers.get(key) || undefined;
  }

  // 如果是普通对象，进行不区分大小写的查找
  const normalizedKey = key.toLowerCase();
  const foundKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === normalizedKey
  );

  return foundKey ? headers[foundKey] : undefined;
};

/**
 * 将任意 Header 集合转换为标准化的全小写对象
 */
export const normalizeHeaders = (headers: Record<string, string>): Record<string, string> => {
  return Object.keys(headers).reduce((acc, key) => {
    acc[key.toLowerCase()] = headers[key];
    return acc;
  }, {} as Record<string, string>);
};

/**
 * 带用户信息的 fetch 请求
 */
export const fetchWithUser = async (url: string, options: RequestInit = {}) => {
  const currentUser = sessionStorage.getItem('matrix_current_user');

  // API基础URL - 使用空字符串以支持相对路径（Vite 代理）
  const API_BASE_URL = '';

  // 如果url是相对路径，添加基础URL
  const fullUrl = url.startsWith('http') || url.startsWith('//') ? url : `${API_BASE_URL}${url}`;

  // 默认 Header 处理
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  // 核心修复：如果 Body 是 FormData，不能手动设置 Content-Type
  // 浏览器会自动填充 multipart/form-data 并携带正确的 boundary
  if (!(options.body instanceof FormData)) {
    if (!getHeaderValue(headers, 'Content-Type')) {
      headers['Content-Type'] = 'application/json';
    }
  }

  if (currentUser) {
    try {
      // 解析用户信息，只提取必要的字段
      const userInfo = JSON.parse(currentUser);
      const minimalUserInfo = {
        account: userInfo.account || userInfo.userAccount,
        name: userInfo.name || userInfo.userName,
        id: userInfo.id || userInfo.userId
      };

      // 对简化后的用户信息进行Base64编码
      const encodedUser = btoa(unescape(encodeURIComponent(JSON.stringify(minimalUserInfo))));
      headers['X-User-Info'] = encodedUser;
    } catch (error) {
      console.error('Error encoding user info:', error);
      // 如果编码失败，不添加用户信息头
    }
  }

  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  // 全局授权过期拦截
  if (response.status === 402) {
    try {
      const data = await response.clone().json();
      window.dispatchEvent(new CustomEvent('matrix:license_locked', {
        detail: { reason: data.reason || '授权已过期' }
      }));
    } catch (e) {
      window.dispatchEvent(new CustomEvent('matrix:license_locked', {
        detail: { reason: '系统授权已熔断' }
      }));
    }
  }

  return response;
};
