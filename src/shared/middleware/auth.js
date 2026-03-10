const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-for-dev-only');
        req.user = decoded; // { uid, email, phone, name }
        next();
    } catch (error) {
        console.error('JWT verification error:', error.message);
        if (error.name === 'JsonWebTokenError') {
            console.error('Hint: This usually means the JWT_SECRET changed. Clear your cookies or log out.');
        }
        res.clearCookie('token');
        return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }
};

module.exports = authMiddleware;
