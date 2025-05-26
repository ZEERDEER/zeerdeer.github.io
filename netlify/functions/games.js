// 初始游戏数据
let games = [
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

exports.handler = async function(event, context) {
  // GET请求 - 获取游戏列表 (公开访问)
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify(games)
    };
  }
  
  // 对于非GET请求，验证令牌
  const token = event.headers.authorization;
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };
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
      
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, games })
      };
    } catch (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
  }
  
  // DELETE请求 - 删除游戏
  if (event.httpMethod === "DELETE") {
    try {
      const { id } = JSON.parse(event.body);
      games = games.filter(game => game.id !== parseInt(id));
      
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, games })
      };
    } catch (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
  }
  
  return { statusCode: 405, body: "Method Not Allowed" };
}; 