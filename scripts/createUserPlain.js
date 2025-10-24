import dbConnect from "../src/lib/dbConnect.js";
import User from "../src/lib/models/User.js";
import bcrypt from "bcryptjs";

const seedUser = async () => {
  await dbConnect();

  const hashed = await bcrypt.hash("scrapperpro786", 10);

  const user = new User({
    username: "admin",
    password: hashed,
  });

  await user.save();
  console.log("✅ User created successfully:", user.username);
  process.exit(0);
};

seedUser().catch((err) => {
  console.error("❌ Error seeding user:", err);
  process.exit(1);
});
