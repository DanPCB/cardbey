#!/usr/bin/env node
/**
 * After db:push:test, prints the commands to run the API and test.
 * Run: npm run e2e:foundation1:setup (that runs db:push:test first, then this script).
 */
const instructions = `
  Schema is pushed to prisma/test.db. Next:

  1) In a separate terminal, start the API using the SAME database:

     cd apps\\core\\cardbey-core
     $env:DATABASE_URL="file:./prisma/test.db"; $env:NODE_ENV="test"; npm run start:api

     Wait until you see "[DB] ✅ Connected ... — using: file:.../prisma/test.db"

  2) In this terminal, run the E2E test:

     npm run test:e2e:foundation1

  If the API was already running, STOP it and restart with the command above
  so it uses test.db (with the OrchestratorTask table).
`;
console.log(instructions);
process.exit(0);
