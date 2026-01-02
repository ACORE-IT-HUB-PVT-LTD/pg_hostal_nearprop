const jwt = require('jsonwebtoken');
require('dotenv').config();
/**
 * ==============================
 *  AUTHENTICATE USER (JWT)
 * ==============================
 */
function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        console.log("Authorization Header:", authHeader);

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authorization token missing",
            });
        }

        const token = authHeader.split(" ")[1];
        console.log("Token extracted:", token);
        console.log("JWT Secret from env:", process.env.JWT_SECRET);

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Decoded JWT payload:", decoded);

        req.user = decoded;

        next();
    } catch (error) {
        console.error("JWT verification failed:", error);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
        });
    }
}


/**
 * ==============================
 *  ROLE BASED ACCESS CONTROL
 * ==============================
 */
function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !Array.isArray(req.user.roles)) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        const userRoles = req.user.roles.map(r => r.toUpperCase());
        const rolesAllowed = allowedRoles.map(r => r.toUpperCase());

        const hasAccess = rolesAllowed.some(role =>
            userRoles.includes(role)
        );

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to perform this action",
            });
        }

        next();
    };
}

/**
 * ==============================
 *  ADMIN ONLY SHORTCUT
 * ==============================
 */
const adminOnly = [
    authenticate,
    authorizeRoles("ADMIN"),
];

/**
 * ==============================
 *  ADMIN OR SUBADMIN
 * ==============================
 */
const adminOrSubAdmin = [
    authenticate,
    authorizeRoles("ADMIN", "SUBADMIN"),
];

// Export all functions as CommonJS
module.exports = {
    authenticate,
    authorizeRoles,
    adminOnly,
    adminOrSubAdmin,
};
