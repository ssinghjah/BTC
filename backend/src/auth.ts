import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

// In production, store users in a database
interface User {
  id: string;
  username: string;
  password: string;
  isAdmin: boolean;
  notifyEmail?: string;
}

const users: User[] = [];
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Helper to generate JWT
export function generateToken(userId: string, isAdmin: boolean): string {
  return jwt.sign({ userId, isAdmin }, JWT_SECRET, { expiresIn: "7d" });
}

// Helper to verify JWT
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Register a new user
export async function register(username: string, password: string, isAdmin: boolean = false): Promise<{ user: Omit<User, "password">; token: string } | { error: string }> {
  // Check if user exists
  if (users.find(u => u.username === username)) {
    return { error: "User already exists" };
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user: User = {
    id: Date.now().toString(),
    username,
    password: hashedPassword,
    isAdmin
  };

  users.push(user);

  // Generate token
  const token = generateToken(user.id, user.isAdmin);

  return {
    user: { id: user.id, username: user.username, isAdmin: user.isAdmin },
    token
  };
}

// Login user
export async function login(username: string, password: string): Promise<{ user: Omit<User, "password">; token: string } | { error: string }> {
  // Find user
  const user = users.find(u => u.username === username);
  if (!user) {
    return { error: "Invalid credentials" };
  }

  // Check password
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return { error: "Invalid credentials" };
  }

  // Generate token
  const token = generateToken(user.id, user.isAdmin);

  return {
    user: { id: user.id, username: user.username, isAdmin: user.isAdmin },
    token
  };
}

// Middleware to authenticate requests
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Attach user info to request
  (req as any).user = payload;
  next();
}

// Middleware to check if user is admin
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;

  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }

  next();
}

// Get user by ID
export function getUserById(userId: string): Omit<User, "password"> | null {
  const user = users.find(u => u.id === userId);
  if (!user) return null;
  
  return { id: user.id, username: user.username, isAdmin: user.isAdmin, notifyEmail: user.notifyEmail };
}

// Update notify email for a user
export function updateNotifyEmail(userId: string, email: string): boolean {
  const user = users.find(u => u.id === userId);
  if (!user) return false;
  user.notifyEmail = email.trim() || undefined;
  return true;
}

// Initialize with a default admin user and regular user
export function initializeDefaultAdmin() {
  const adminUsername = "admin";
  const adminPassword = "admin123"; // Change this in production!
  
  if (!users.find(u => u.username === adminUsername)) {
    register(adminUsername, adminPassword, true);
    console.log("Default admin user created:", adminUsername);
  }

  const defaultUsername = "user";
  const defaultPassword = "user123"; // Change this in production!
  
  if (!users.find(u => u.username === defaultUsername)) {
    register(defaultUsername, defaultPassword, false);
    console.log("Default user created:", defaultUsername);
  }
}

// Get all users (admin only)
export function getAllUsers(): Array<Omit<User, "password">> {
  return users.map(u => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, notifyEmail: u.notifyEmail }));
}
