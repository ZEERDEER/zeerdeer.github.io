const crypto = require('crypto');

// 初始游戏数据（生产环境中保持为空，以验证持久化是否生效）
const defaultGames = [];

// 使用 Netlify Blobs 存储服务
const { getStore } = require('@netlify/blobs');

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
    console.error('DEBUG: 验证失败 - 签名不匹配');
    return false;
  }

  return true;
}

exports.handler = async function (event, context) {
  let games = [];
  let store;
  let storeStatus = "Not initialized";

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  // 获取 Token (兼容大小写)
  const token = event.headers.authorization || event.headers.Authorization;

  try {
    store = getStore();
    console.log('DEBUG: 正在尝试连接 Netlify Blobs...');

    const kvGames = await store.get('games_data', { type: 'json' });
    if (kvGames) {
      console.log(`DEBUG: 成功载入云端数据，共 ${kvGames.length} 个项目`);
      games = kvGames;
      storeStatus = "Connected (Data found)";
    } else {
      console.log('DEBUG: 云端存储目前为空');
      storeStatus = "Connected (Empty)";
    }
  } catch (error) {
    console.error('DEBUG: [致命错误] 无法连接 Blobs 存储:', error.message);
    storeStatus = `Error: ${error.message}`;
  }

  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { ...headers, 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      body: JSON.stringify({
        games,
        serverTime: new Date().toISOString(),
        storeStatus
      })
    };
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: '' };
  }

  if (!isValidToken(token)) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: "无效的身份令牌", storeStatus })
    };
  }

  if (event.httpMethod === "POST") {
    try {
      const { name, icon, steamId, id } = JSON.parse(event.body);
      let finalName = name;
      let finalIcon = icon;

      if (steamId && (!finalName || !finalIcon)) {
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

      const cleanName = (finalName || "Unknown").replace(/<[^>]*>?/gm, '');
      const cleanIcon = (finalIcon || "").replace(/<[^>]*>?/gm, '');

      if (id) {
        const index = games.findIndex(g => g.id === parseInt(id));
        if (index !== -1) {
          games[index] = { ...games[index], name: cleanName, icon: cleanIcon, steamId: steamId || null };
        }
      } else {
        games.push({ id: Date.now(), name: cleanName, icon: cleanIcon, steamId: steamId || null });
      }

      if (store) {
        await store.setJSON('games_data', games);
        console.log('DEBUG: 数据已成功保存到云端 Blobs');
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, games, storeStatus: "Updated" }) };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, storeStatus }) };
    }
  }

  if (event.httpMethod === "DELETE") {
    try {
      const { id } = JSON.parse(event.body);
      games = games.filter(g => g.id !== parseInt(id));

      if (store) {
        await store.setJSON('games_data', games);
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, games, storeStatus: "Deleted" }) };
    } catch (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, storeStatus }) };
    }
  }

  return { statusCode: 405, headers, body: "Method Not Allowed" };
};