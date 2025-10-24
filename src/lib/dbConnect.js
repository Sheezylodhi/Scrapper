import mongoose from "mongoose";

let isConnected = false;

export async function connectToDatabase() {
  if (isConnected) return;

  if (!process.env.MONGODB_URI) {
    throw new Error("❌ MONGODB_URI missing in environment variables");
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "myscrapper",
    });
    isConnected = conn.connections[0].readyState;
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    throw err;
  }
}
