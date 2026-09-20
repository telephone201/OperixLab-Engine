import { config } from "../src/config/config-manager";
console.log("DATABASE_URL: " + config.get("databaseUrl"));
