import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Extended Express Request with authentication data
 */
export interface AuthRequest extends Request {
  userId?: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Authentication middleware - validates Bearer token
 * Rejects requests without valid token
 */
export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    logger.warn({ path: req.path }, "Missing or invalid authorization header");
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid Bearer token",
    });
  }

  const token = authHeader.slice(7);

  try {
    // TODO: Implement token validation
    // For now, just extract and pass through
    // In production, validate JWT or lookup in database

    req.token = token;
    req.userId = "user-from-token"; // Extract from token payload

    logger.info({ userId: req.userId, path: req.path }, "User authenticated");
    return next();
  } catch (error) {
    logger.error({ error, token: token.slice(0, 10) }, "Token validation failed");
    return res.status(401).json({
      error: "Unauthorized",
      message: "Invalid token",
    });
  }
};

/**
 * Optional authentication middleware
 * Allows requests without token but extracts user if present
 */
export const optionalAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      // TODO: Validate token
      req.token = token;
      req.userId = "user-from-token";
      logger.debug({ userId: req.userId }, "Optional auth: user authenticated");
    } catch (error) {
      logger.debug({ error }, "Optional auth: token validation failed, continuing");
    }
  }

  return next();
};

/**
 * Role-based authorization middleware
 * Checks if user has required role
 */
export const authorize = (requiredRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "User not authenticated",
      });
    }

    if (!requiredRoles.includes(req.user.role)) {
      logger.warn(
        { userId: req.user.id, requiredRoles, userRole: req.user.role },
        "User does not have required role"
      );
      return res.status(403).json({
        error: "Forbidden",
        message: "User does not have required permissions",
      });
    }

    return next();
  };
};
