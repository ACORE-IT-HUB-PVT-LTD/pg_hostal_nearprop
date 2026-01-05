const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Authorization token missing'
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        console.log('Decoded JWT:', decoded);

        /**
         * CASE 1️⃣ : ADMIN / SUBADMIN TOKEN
         * roles array present hai
         */
        if (Array.isArray(decoded.roles) && decoded.roles.length > 0) {
            const allowedRoles = ['ADMIN', 'SUBADMIN', 'USER'];

            const hasValidRole = decoded.roles.some(role =>
                allowedRoles.includes(role)
            );

            if (!hasValidRole) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied: insufficient role'
                });
            }

            req.user = {
                pgUserId: decoded.userId || decoded.sub,
                roles: decoded.roles,
                sessionId: decoded.sessionId,
                tokenType: 'ADMIN'
            };

            return next(); // ✅ VERIFIED
        }

        /**
         * CASE 2️⃣ : OTP LOGIN TOKEN (landlord / tenant)
         */
        if (decoded.role) {
            req.user = {
                mongoUserId: decoded.id,
                pgUserId: decoded.userId,
                role: decoded.role,
                sessionId: decoded.sessionId,
                tokenType: 'APP_USER'
            };

            return next(); // ✅ VERIFIED
        }

        /**
         * ❌ Unknown token structure
         */
        return res.status(401).json({
            success: false,
            message: 'Invalid token structure'
        });

    } catch (error) {
        console.error('Auth error:', error.message);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

module.exports = authenticate;
