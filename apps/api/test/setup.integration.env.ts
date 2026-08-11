import {
  applyTestEnvironment,
  assertDestructiveTestEnvironment,
} from "./environment";

// Integration specs write to Postgres/Redis. Require an explicit opt-in before
// importing any application module or opening a service connection.
assertDestructiveTestEnvironment();
applyTestEnvironment();
