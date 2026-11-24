import { spawn } from "node:child_process";

if (process.env.DEPLOYMENT_MODE !== "demo") {
  console.error("start:demo requires DEPLOYMENT_MODE=demo. Use npm run start for other deployments.");
  process.exit(1);
}

const required = [
  "DATABASE_URL",
  "STORAGE_ENDPOINT",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_BUCKET",
  "STORAGE_REGION",
  "STORAGE_PUBLIC_URL"
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`Missing demo configuration: ${missing.join(", ")}. See docs/FREE-DEMO.md.`);
  process.exit(1);
}

let child;
let stopping = false;

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
    if (child) child.kill(signal);
  });
}

async function run(command, args) {
  if (stopping) process.exit(1);
  await new Promise((resolve, reject) => {
    child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      child = undefined;
      if (code === 0 && !signal) resolve();
      else reject(new Error(`${command} exited ${signal ? `with ${signal}` : `with status ${code}`}.`));
    });
  });
}

try {
  // Run idempotent setup before the server starts, including after a cold start.
  // Never run the development seed against the public demo database.
  await run("npm", ["run", "db:migrate:deploy"]);
  await run("npm", ["run", "demo:bootstrap"]);
  if (process.env.DEMO_SEED_DATA === "true") {
    await run("npm", ["run", "demo:seed-data"]);
  }
  await run(process.execPath, [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname", "0.0.0.0",
    "--port", process.env.PORT || "3000"
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Demo startup failed.");
  process.exitCode = 1;
}
