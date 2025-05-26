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

// 使用Netlify环境变量获取KV存储访问权限
const { getStore } = require('@netlify/functions');

exports.handler = async function(event, context) {
  // 初始化KV存储
  const store = getStore('GAMES_KV');
  
  // 尝试从KV存储获取游戏数据，如果没有则使用默认数据
  let games = await store.get('games_data');
  if (!games) {
    games = defaultGames;
    // 首次使用时初始化KV存储
    await store.set('games_data', games);
  }
  
  // GET请求 - 获取游戏列表 (公开访问)
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify(games),
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    };
  }
  
  // 对于非GET请求，验证令牌
  const token = event.headers.authorization;
  if (!token) {
    return { 
      statusCode: 401, 
      body: JSON.stringify({ message: "Unauthorized" }),
      headers: { 'Content-Type': 'application/json' }
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
      
      // 保存更新后的游戏数据到KV存储
      await store.set('games_data', games);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, games }),
        headers: { 'Content-Type': 'application/json' }
      };
    } catch (error) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      };
    }
  }
  
  // DELETE请求 - 删除游戏
  if (event.httpMethod === "DELETE") {
    try {
      const { id } = JSON.parse(event.body);
      games = games.filter(game => game.id !== parseInt(id));
      
      // 保存更新后的游戏数据到KV存储
      await store.set('games_data', games);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, games }),
        headers: { 'Content-Type': 'application/json' }
      };
    } catch (error) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: error.message }),
        headers: { 'Content-Type': 'application/json' }
      };
    }
  }
  
  return { 
    statusCode: 405, 
    body: JSON.stringify({ message: "Method Not Allowed" }),
    headers: { 'Content-Type': 'application/json' }
  };
}; 