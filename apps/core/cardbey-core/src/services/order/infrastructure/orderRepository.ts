import { getPrismaClient } from '../../../lib/prisma.js';

export function getOrderPrisma() {
  return getPrismaClient() as unknown as {
    order: {
      findMany: (...args: any[]) => Promise<any[]>;
      count: (...args: any[]) => Promise<number>;
      findUnique: (...args: any[]) => Promise<any>;
      update: (...args: any[]) => Promise<any>;
    };
    orderItem: {
      createMany?: (...args: any[]) => Promise<any>;
      findMany?: (...args: any[]) => Promise<any[]>;
    };
    orderStatusEvent: {
      create: (...args: any[]) => Promise<any>;
    };
    orderCancelRequest: {
      create: (...args: any[]) => Promise<any>;
      update: (...args: any[]) => Promise<any>;
      findUnique?: (...args: any[]) => Promise<any>;
    };
  };
}

