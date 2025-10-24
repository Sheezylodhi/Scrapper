// src/lib/jwt.js
import jwt from "jsonwebtoken";
const SECRET = process.env.JWT_SECRET || "change_this_secret";
export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}
export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
