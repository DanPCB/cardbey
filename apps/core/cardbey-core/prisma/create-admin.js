const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("Admin123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@cardbey.com" },
    update: {},
    create: {
      email: "admin@cardbey.com",
      name: "Admin User",
      password: password,
      role: "ADMIN",
      emailVerified: new Date(),
      isActive: true,
    },
  });

  console.log("✅ Admin created:", admin.email);
  console.log("🔑 Password: Admin123!");
}

main()
  .catch((e) => {
    console.error("❌ Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
