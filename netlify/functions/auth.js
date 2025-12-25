const crypto = require('crypto');

exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    
    try {
      const { username, password } = JSON.parse(event.body);
      
      const validUsername = process.env.ADMIN_USERNAME;
      const validPassword = process.env.ADMIN_PASSWORD;
      const apiSecret = process.env.API_SECRET || validPassword;
      
      if (username === validUsername && password === validPassword) {
        const timestamp = Date.now().toString();
        const signature = crypto.createHmac('sha256', apiSecret)
                               .update(timestamp)
                               .digest('base64');
        const token = `${timestamp}.${signature}`;
        
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