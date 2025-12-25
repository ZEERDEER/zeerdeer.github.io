const crypto = require('crypto');

// 初始游戏数据（生产环境中建议保持为空，仅供首次初始化使用）
const defaultGames = [];

// 内存中的游戏数据（作为KV存储的备份）
let memoryGames = [...defaultGames];

// 使用Netlify环境变量获取KV存储访问权限
const { getStore } = require('@netlify/functions');

// 辅助函数：验证令牌
function isValidToken(token) {
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const apiSecret = process.env.API_SECRET || process.env.ADMIN_PASSWORD;

  if (!apiSecret) {
    console.error('CRITICAL: API_SECRET or ADMIN_PASSWORD not set in environment!');
    return false;
  }

  // 验证签名
  const expectedSignature = crypto.createHmac('sha256', apiSecret)
    .update(timestamp)
    .digest('base64');

  if (signature !== expectedSignature) return false;

  // 验证时间戳（例如 24 小时内有效）
  const tokenTime = parseInt(timestamp);
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  if (now - tokenTime > twentyFourHours) return false;

  return true;
}

exports.handler = async function (event, context) {
  let games = [...memoryGames];
  let useKV = true;

  // CORS 设置 - 在生产环境中应更严格
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  try {
    const store = getStore('GAMES_KV');
    console.log('Attempting to fetch games from KV store...');
    const kvGames = await store.get('games_data');

    if (kvGames) {
      console.log('Successfully loaded games from KV:', kvGames.length, 'items');
      games = kvGames;
      memoryGames = [...games];
    } else {
      console.log('KV store empty or games_data key not found. Using defaults.');
      try {
        await store.set('games_data', games);
        console.log('Initialized KV store with default/memory games.');
      } catch (initError) {
        console.error('Failed to initialize KV store:', initError.message);
      }
    }
  } catch (error) {
    console.error('CRITICAL ERROR accessing KV store:', error.message);
    if (error.stack) console.error(error.stack);
    useKV = false;
  }

  // GET请求 - 获取游戏列表 (公开访问)
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify(games),
      headers: {
        ...headers,
        'Cache-Control': 'no-cache'
      }
    };
  }

  // 对于非GET请求，处理OPTIONS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // 验证令牌
  const token = event.headers.authorization;
  if (!isValidToken(token)) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Unauthorized or token expired" }),
      headers
    };
  }

  // POST请求 - 添加或更新游戏
  if (event.httpMethod === "POST") {
    try {
      const gameData = JSON.parse(event.body);
      let { name, icon, steamId, id } = gameData;

      // 如果提供了 steamId，从 Steam 获取信息
      if (steamId) {
        try {
          // 在 Netlify Functions 中使用原生 fetch
          const steamResponse = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamId}`);
          const steamData = await steamResponse.json();

          if (steamData[steamId] && steamData[steamId].success) {
            const data = steamData[steamId].data;
            if (!name) name = data.name;
            if (!icon) icon = data.header_image;
          }
        } catch (error) {
          console.error('Steam API 访问失败:', error);
        }
      }

      // 输入验证
      if (!name || !icon) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "游戏名称和图标是必填的（或者提供有效的 Steam AppID）" }),
          headers
        };
      }

      // 简单的 XSS 防护
      const sanitizedName = name.replace(/<[^>]*>?/gm, '');
      const sanitizedIcon = icon.replace(/<[^>]*>?/gm, '');

      if (id) {
        const index = games.findIndex(g => g.id === parseInt(id));
        if (index !== -1) {
          games[index] = { id: parseInt(id), name: sanitizedName, icon: sanitizedIcon, steamId: steamId || null };
        }
      } else {
        const newGame = {
          id: Date.now(),
          name: sanitizedName,
          icon: sanitizedIcon,
          steamId: steamId || null
        };
        games.push(newGame);
      }

      memoryGames = [...games];

      if (useKV) {
        try {
          const store = getStore('GAMES_KV');
          await store.set('games_data', games);
        } catch (error) {
          console.log('KV存储更新失败:', error);
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, games }),
        headers
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
        headers
      };
    }
  }

  // DELETE请求 - 删除游戏
  if (event.httpMethod === "DELETE") {
    try {
      const { id } = JSON.parse(event.body);
      if (!id) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Game ID is required" }),
          headers
        };
      }

      games = games.filter(game => game.id !== parseInt(id));
      memoryGames = [...games];

      if (useKV) {
        try {
          const store = getStore('GAMES_KV');
          await store.set('games_data', games);
        } catch (error) {
          console.log('KV存储更新失败:', error);
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, games }),
        headers
      };
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
        headers
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ message: "Method Not Allowed" }),
    headers
  };
}; 