import { connectToDatabase } from "@/lib/dbConnect";
import User from "@/lib/models/Admin";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export async function POST(req) {
  try {
    await connectToDatabase();
    const { username, password } = await req.json();

    if (!username || !password)
      return new Response(JSON.stringify({ error: "All fields required" }), { status: 400 });

    const user = await User.findOne({ username });
    if (!user)
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return new Response(JSON.stringify({ error: "Invalid password" }), { status: 401 });

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return new Response(JSON.stringify({ token }), { status: 200 });
  } catch (err) {
    console.error("Login API Error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}
