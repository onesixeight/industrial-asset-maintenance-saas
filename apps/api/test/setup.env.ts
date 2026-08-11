import { applyTestEnvironment } from "./environment";

// Unit specs never connect to live services. Safe canonical loopback
// placeholders keep the Docker-free fast gate hermetic on a fresh clone,
// while explicitly supplied URLs still win for focused local runs.
applyTestEnvironment({
  DATABASE_URL_TEST:
    process.env.DATABASE_URL_TEST ??
    "postgresql://iam:iam@localhost:5433/iam_test?schema=public",
  REDIS_URL_TEST: process.env.REDIS_URL_TEST ?? "redis://localhost:6380/1",
});
