const { config } = require("../src/config/config-manager");
console.log("DATABASE_URL: " + config.get("databaseUrl"));
