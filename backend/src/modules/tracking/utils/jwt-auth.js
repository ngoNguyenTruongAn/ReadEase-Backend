const jwt = require('jsonwebtoken');

function verifyWebSocketJWT(token) {
  if (!token) {
    throw new Error('Missing token');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.user_id || !decoded.session_id) {
      throw new Error('Invalid token payload');
    }

    return {
      user_id: decoded.user_id,
      session_id: decoded.session_id,
    };
  } catch {
    throw new Error('JWT validation failed');
  }
}

module.exports = {
  verifyWebSocketJWT,
};
