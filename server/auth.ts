import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import bcrypt from "bcryptjs";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      firstName: string | null;
      lastName: string | null;
      role: string;
    }
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  const sessionSecret = process.env.SESSION_SECRET || "fallback-secret-change-in-production";
  
  return session({
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "اسم المستخدم غير صحيح" });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "كلمة المرور غير صحيحة" });
        }

        return done(null, {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        });
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        done(null, {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        });
      } else {
        done(null, false);
      }
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) {
        return res.status(500).json({ message: "خطأ في الخادم" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "بيانات غير صحيحة" });
      }
      req.logIn(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "خطأ في تسجيل الدخول" });
        }
        return res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "خطأ في تسجيل الخروج" });
      }
      res.json({ success: true });
    });
  });

  await initializeRootUser();
}

async function initializeRootUser() {
  try {
    const existingRoot = await storage.getUserByUsername("root");
    if (!existingRoot) {
      const hashedPassword = await bcrypt.hash("123123123", 10);
      await storage.createUser({
        username: "root",
        password: hashedPassword,
        firstName: "المدير",
        lastName: "الرئيسي",
        role: "مدير",
      });
      console.log("Root user created with username: root");
    }
  } catch (error) {
    console.error("Error initializing root user:", error);
  }
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};

export function requireRole(allowedRoles: string[]): RequestHandler {
  return (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "يجب تسجيل الدخول أولاً" });
    }

    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "لا تملك صلاحية لتنفيذ هذا الإجراء" });
    }

    return next();
  };
}

export const isAdmin: RequestHandler = requireRole(["مدير"]);
