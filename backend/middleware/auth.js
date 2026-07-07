// middleware/auth.js — JWT authentication middleware (hardened)
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set.');
    console.error('Set it in your .env file: JWT_SECRET=your_random_secret_here');
    process.exit(1);
}

const authMiddleware = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('JWT verification error:', error.message);
        if (error.name === 'TokenExpiredError') {
            res.clearCookie('token', { path: '/' });
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            console.error('Hint: This usually means the JWT_SECRET changed. Clear your cookies.');
        }
        res.clearCookie('token', { path: '/' });
        return res.status(401).json({ error: 'Invalid session. Please log in again.' });
    }
};

// Export both the middleware and the secret (for token generation in auth routes)
module.exports = authMiddleware;
module.exports.JWT_SECRET = JWT_SECRET;
