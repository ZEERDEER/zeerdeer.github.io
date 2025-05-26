// 初始游戏数据
const defaultGames = [
  {
    id: 1,
    name: "Ghost Of Tsushima Legend Mode",
    icon: "https://img.122200.xyz/GhostOfTsushima.ico"
  },
  {
    id: 2,
    name: "Rise of the Rōnin",
    icon: "https://img.122200.xyz/RiseoftheRonin.png"
  }
];

// 内存中的游戏数据（作为KV存储的备份）
let memoryGames = [...defaultGames];

// 使用Netlify环境变量获取KV存储访问权限
const { getStore } = require('@netlify/functions');

exports.handler = async function(event, context) {
  let games = [...memoryGames];
  let useKV = true;
  
  try {
    // 尝试初始化KV存储
    const store = getStore('GAMES_KV');
    
    // 尝试从KV存储获取游戏数据
    const kvGames = await store.get('games_data');
    if (kvGames) {
      games = kvGames;
      memoryGames = [...games]; // 更新内存中的备份
    } else {
      // 首次使用时初始化KV存储
      try {
        await store.set('games_data', games);
      } catch (error) {
        console.log('KV存储初始化失败:', error);
        useKV = false;
      }
    }
  } catch (error) {
    console.log('KV存储不可用:', error);
    useKV = false;
  }
  
  // GET请求 - 获取游戏列表 (公开访问)
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify(games),
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*' // 允许跨域访问
      }
    };
  }
  
  // 对于非GET请求，验证令牌
  const token = event.headers.authorization;
  if (!token) {
    return { 
      statusCode: 401, 
      body: JSON.stringify({ message: "Unauthorized" }),
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    };
  }
  
  // POST请求 - 添加或更新游戏
  if (event.httpMethod === "POST") {
    try {
      const newGame = JSON.parse(event.body);
      
      if (newGame.id) {
        // 更新现有游戏
        const index = games.findIndex(g => g.id === parseInt(newGame.id));
        if (index !== -1) {
          games[index] = { ...newGame, id: parseInt(newGame.id) };
        }
      } else {
        // 添加新游戏
        newGame.id = Date.now();
        games.push(newGame);
      }
      
      // 更新内存中的备份
      memoryGames = [...games];
      
      // 尝试保存到KV存储
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
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    } catch (error) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: error.message }),
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }
  }
  
  // DELETE请求 - 删除游戏
  if (event.httpMethod === "DELETE") {
    try {
      const { id } = JSON.parse(event.body);
      games = games.filter(game => game.id !== parseInt(id));
      
      // 更新内存中的备份
      memoryGames = [...games];
      
      // 尝试保存到KV存储
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
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    } catch (error) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: error.message }),
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      };
    }
  }
  
  // OPTIONS请求 - 处理CORS预检请求
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
      },
      body: ''
    };
  }
  
  return { 
    statusCode: 405, 
    body: JSON.stringify({ message: "Method Not Allowed" }),
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  };
}; 