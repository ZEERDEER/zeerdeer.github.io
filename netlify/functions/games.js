const crypto = require('crypto');

// 初始游戏数据（生产环境中保持为空，以验证持久化是否生效）
const defaultGames = [];

// 内存缓存（防止频繁读取，但主要依赖云端持久化）
let memoryGames = [...defaultGames];

// 使用 Netlify Functions V2 兼容的 Blobs 接口
const { getStore } = require('@netlify/functions');

/**
 * 验证 Token 的合法性
 * 依赖环境变量: ADMIN_PASSWORD 或 API_SECRET
 */
function isValidToken(token) {
  if (!token) {
    console.error('DEBUG: 验证失败 - 未提供 Authorization Header');
    return false;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    console.error('DEBUG: 验证失败 - Token 格式错误');
    return false;
  }

  const [timestamp, signature] = parts;
  const apiSecret = process.env.API_SECRET || process.env.ADMIN_PASSWORD;

  if (!apiSecret) {
    console.error('DEBUG: 验证中断 - 服务器环境中缺失 ADMIN_PASSWORD 或 API_SECRET');
    return false;
  }

  const expectedSignature = crypto.createHmac('sha256', apiSecret)
    .update(timestamp)
    .digest('base64');

  if (signature !== expectedSignature) {
    console.error('DEBUG: 验证失败 - 签名不匹配（可能是密码/密钥不一致）');
    return false;
  }

  // 验证 Token 时效 (24小时)
  const tokenTime = parseInt(timestamp);
  const now = Date.now();
  if (now - tokenTime > 24 * 60 * 60 * 1000) {
    console.error('DEBUG: 验证失败 - Token 已过期');
    return false;
  }

  return true;
}

exports.handler = async function (event, context) {
  let games = [...memoryGames];
  let store;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  // --- 1. 连接云端存储 ---
  try {
    // getStore() 不传参则访问站点的默认 Blobs 存储桶
    store = getStore();
    console.log('DEBUG: 正在尝试从 Netlify Blobs 获取数据...');

    const kvGames = await store.get('games_data', { type: 'json' });
    if (kvGames) {
      console.log(`DEBUG: 成功载入云端数据，共 ${kvGames.length} 个项目`);
      games = kvGames;
      memoryGames = [...games]; // 更新内存缓存
    } else {
      console.log('DEBUG: 云端存储目前为空');
    }
  } catch (error) {
    console.error('DEBUG: [致命错误] 无法连接 Blobs 存储:', error.message);
  }

  // --- 2. 处理请求路由 ---

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { ...headers, 'Cache-Control': 'no-cache' },
      body: JSON.stringify(games)
    };
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: '' };
  }

  // --- 3. 身份验证 (POST/DELETE) ---
  const token = event.headers.authorization;
  if (!isValidToken(token)) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: "无效的身份令牌或 Token 已过期" })
    };
  }

  // --- 4. 修改数据逻辑 ---

  if (event.httpMethod === "POST") {
    try {
      const { name, icon, steamId, id } = JSON.parse(event.body);
      let finalName = name;
      let finalIcon = icon;

      // 如果有 Steam ID，则优先抓取
      if (steamId) {
        try {
          const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}`);
          const steamData = await steamRes.json();
          if (steamData[steamId] && steamData[steamId].success) {
            const data = steamData[steamId].data;
            if (!finalName) finalName = data.name;
            if (!finalIcon) finalIcon = data.header_image;
          }
        } catch (e) {
          console.error('DEBUG: Steam API 访问受阻');
        }
      }

      if (!finalName || !finalIcon) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: "缺少必要数据" }) };
      }

      const cleanName = finalName.replace(/<[^>]*>?/gm, '');
      const cleanIcon = finalIcon.replace(/<[^>]*>?/gm, '');

      if (id) {
        const index = games.findIndex(g => g.id === parseInt(id));
        if (index !== -1) {
          games[index] = { ...games[index], name: cleanName, icon: cleanIcon, steamId: steamId || null };
        }
      } else {
        games.push({ id: Date.now(), name: cleanName, icon: cleanIcon, steamId: steamId || null });
      }

      // --- 同步到云端 ---
      if (store) {
        await store.setJSON('games_data', games);
        console.log('DEBUG: 数据已成功保存到云端 Blobs');
      }

      memoryGames = [...games]; // 更新缓存
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, games }) };

    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  if (event.httpMethod === "DELETE") {
    try {
      const { id } = JSON.parse(event.body);
      games = games.filter(g => g.id !== parseInt(id));

      if (store) {
        await store.setJSON('games_data', games);
        console.log('DEBUG: 已在云端删除项目并同步完成');
      }

      memoryGames = [...games];
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, games }) };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  return { statusCode: 405, headers, body: "Method Not Allowed" };
};