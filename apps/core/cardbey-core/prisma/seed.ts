import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@cardbey.com" },
    update: {},
    create: {
      email: "admin@cardbey.com",
      displayName: "Admin",
      fullName: "Admin User",
      passwordHash: passwordHash,
      role: "ADMIN",
      emailVerified: true,
      // ✅ Removed isActive and accountType (not in schema)
    },
  });

  console.log("✅ Admin created:", admin.email);
  console.log("👤 Display Name:", admin.displayName);
  console.log("🔑 Password: Admin123!");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
