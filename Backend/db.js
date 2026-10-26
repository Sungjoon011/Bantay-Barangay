// db.js : the ONE place that creates the Prisma client.
// Every write (create/update/delete) is wrapped so PostgreSQL knows WHO did it:
// the logged-in account id is set as "app.account_id" for that transaction,
// and the audit triggers read it. No audit code in the routes.
const { PrismaClient } = require('@prisma/client');
const { AsyncLocalStorage } = require('async_hooks');

const actorStore = new AsyncLocalStorage();
const basePrisma = new PrismaClient();

const WRITE_OPS = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, args, query }) {
        const actor = actorStore.getStore();
        if (!actor || !WRITE_OPS.has(operation)) {
          return query(args);
        }
        const [, result] = await basePrisma.$transaction([
          basePrisma.$executeRaw`SELECT set_config('app.account_id', ${String(actor.accountId)}, true)`,
          query(args),
        ]);
        return result;
      },
    },
  },
});

module.exports = { prisma, actorStore };
