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
  console.log(`DEBUG: [收到请求] Method: ${event.httpMethod}, Path: ${event.path}`);

  let games = [];
  let store;
  let storeStatus = "Initializing";

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  // 1. 获取 Authorization Token
  const authHeader = event.headers.authorization || event.headers.Authorization;
  console.log(`DEBUG: [Auth Header] ${authHeader ? '已提供' : '未提供'}`);

  // 2. 连接云端存储
  try {
    // 显式指定存储桶名称 (Object Syntax)
    store = getStore({ name: 'GAMES_KV', consistency: 'strong' });
    console.log('DEBUG: [Blobs] 正在尝试读取 games_data...');

    const kvGames = await store.get('games_data', { type: 'json' });
    if (kvGames) {
      games = Array.isArray(kvGames) ? kvGames : [];
      console.log(`DEBUG: [Blobs] 读取成功 - 数量: ${games.length}`);
      storeStatus = `Connected (${games.length} items)`;
    } else {
      console.log('DEBUG: [Blobs] 读取完成 - 存储为空');
      storeStatus = "Connected (Empty)";
    }
  } catch (error) {
    console.error('DEBUG: [Blobs] 访问失败:', error.message);
    storeStatus = `Error: ${error.message}`;
  }

  // 3. 处理 OPTIONS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: '' };
  }

  // 4. GET 请求
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: { ...headers, 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      body: JSON.stringify({
        games,
        serverTime: new Date().toISOString(),
        storeStatus,
        debug: "V3-Verbose"
      })
    };
  }

  // 5. 鉴权 (POST/DELETE)
  if (!isValidToken(authHeader)) {
    console.error('DEBUG: [鉴权] 失败 - Token 无效或过期');
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ message: "无效的身份令牌", storeStatus })
    };
  }

  // 6. POST 请求 (添加/编辑)
  if (event.httpMethod === "POST") {
    try {
      console.log('DEBUG: [POST] 准备处理数据...');
      const body = JSON.parse(event.body || '{}');
      let { name, icon, steamId, id } = body;
      console.log(`DEBUG: [POST] 原始数据 - ID: ${id}, SteamID: ${steamId}, Name: ${name}`);

      if (steamId && (!name || !icon)) {
        try {
          console.log(`DEBUG: [Steam] 正在获取 AppID ${steamId} 的详情...`);
          const steamRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}`);
          const steamJson = await steamRes.json();
          if (steamJson && steamJson[steamId] && steamJson[steamId].success) {
            const data = steamJson[steamId].data;
            name = name || data.name;
            icon = icon || data.header_image;
            console.log(`DEBUG: [Steam] 抓取成功: ${name}`);
          } else {
            console.warn(`DEBUG: [Steam] AppID ${steamId} 详情抓取失败`);
          }
        } catch (e) {
          console.error('DEBUG: [Steam] API 访问错误:', e.message);
        }
      }

      if (!name || !icon) {
        console.error('DEBUG: [POST] 失败 - 缺少必要名称或图标');
        return { statusCode: 400, headers, body: JSON.stringify({ message: "无法获取游戏信息，请确保 AppID 正确或手动填写" }) };
      }

      const cleanName = name.replace(/<[^>]*>?/gm, '');
      const cleanIcon = icon.replace(/<[^>]*>?/gm, '');

      let finalId = id ? parseInt(id) : null;
      if (finalId) {
        const index = games.findIndex(g => g.id === finalId);
        if (index !== -1) {
          games[index] = { ...games[index], name: cleanName, icon: cleanIcon, steamId: steamId || null };
          console.log(`DEBUG: [POST] 已更新现有游戏 ID: ${finalId}`);
        } else {
          console.warn(`DEBUG: [POST] 未找到 ID 为 ${finalId} 的游戏，将作为新游戏添加`);
          games.push({ id: Date.now(), name: cleanName, icon: cleanIcon, steamId: steamId || null });
        }
      } else {
        const newItem = { id: Date.now(), name: cleanName, icon: cleanIcon, steamId: steamId || null };
        games.push(newItem);
        console.log('DEBUG: [POST] 已添加新游戏');
      }

      // 同步到云端
      if (store) {
        console.log('DEBUG: [Blobs] 正在同步数据到云端...');
        await store.setJSON('games_data', games);
        console.log('DEBUG: [Blobs] 同步成功');
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, games, storeStatus: "Saved" }) };
    } catch (error) {
      console.error('DEBUG: [POST] 内部错误:', error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, storeStatus }) };
    }
  }

  // 7. DELETE 请求
  if (event.httpMethod === "DELETE") {
    try {
      const { id } = JSON.parse(event.body || '{}');
      console.log(`DEBUG: [DELETE] 准备删除 ID: ${id}`);

      const originalLength = games.length;
      games = games.filter(g => g.id !== parseInt(id));

      if (games.length !== originalLength) {
        if (store) {
          await store.setJSON('games_data', games);
          console.log('DEBUG: [DELETE] 云端数据同步成功');
        }
      } else {
        console.warn(`DEBUG: [DELETE] 未找到 ID 为 ${id} 的项`);
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, games, storeStatus: "Deleted" }) };
    } catch (error) {
      console.error('DEBUG: [DELETE] 内部错误:', error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, storeStatus }) };
    }
  }

  return { statusCode: 405, headers, body: "Method Not Allowed" };
};