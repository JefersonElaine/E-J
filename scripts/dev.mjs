import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(name, cwd, command, args) {
  const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env, shell: false });
  child.on("exit", (code) => {
    console.log(`[${name}] encerrado (${code})`);
    process.exit(code || 0);
  });
  return child;
}

const backend = run("api", path.join(root, "backend"), "npm", ["run", "dev"]);
const frontend = run("web", path.join(root, "frontend"), "npm", ["run", "dev"]);

function stop() {
  backend.kill("SIGTERM");
  frontend.kill("SIGTERM");
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
