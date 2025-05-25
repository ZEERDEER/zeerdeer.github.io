exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    
    try {
      const { username, password } = JSON.parse(event.body);
      
      // 使用环境变量获取凭据
      const validUsername = process.env.ADMIN_USERNAME;
      const validPassword = process.env.ADMIN_PASSWORD;
      
      // 验证凭据
      if (username === validUsername && password === validPassword) {
        const token = Buffer.from(Date.now().toString()).toString('base64');
        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, token })
        };
      } else {
        return {
          statusCode: 401,
          body: JSON.stringify({ success: false, message: "Invalid credentials" })
        };
      }
    } catch (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
  };