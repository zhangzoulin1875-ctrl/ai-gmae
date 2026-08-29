import { PrismaClient } from '@prisma/client';

// Singleton Prisma client (avoids exhausting DB connections with hot-reload / multiple imports)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
