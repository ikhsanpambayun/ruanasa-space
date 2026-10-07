import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma CLI tidak membaca .env.local secara default; muat sama seperti ConfigModule (.env.local lalu .env).
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

export default defineConfig({
  schema: 'src/database/prisma/schema.prisma',
  migrations: {
    path: 'src/database/prisma/migrations',
    seed: 'tsx src/database/prisma/seed.ts',
  },
});
