const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require(path.resolve(process.cwd(), 'src/lib/models/Admin')).default;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in .env.local");
    process.exit(1);
  }
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log("✅ MongoDB connected");
}

async function createAdmin(username, password) {
  await connectDB();
  const existing = await Admin.findOne({ username });

  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    console.log(`⚠️ Admin "${username}" already exists. Use --force to overwrite.`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const newAdmin = await Admin.create({ username, passwordHash });
  console.log(`✅ Admin created: ${newAdmin.username}`);
  await mongoose.disconnect();
  process.exit(0);
}

// Get CLI args
const argv = process.argv.slice(2);
const username = argv[0] || "admin";
const password = argv[1] || "Nesto$@123";

createAdmin(username, password);
