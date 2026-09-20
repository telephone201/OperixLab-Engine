const { Pool } = require("pg");
async function run() {
    const pool = new Pool({
        user: "postgres",
        host: "localhost",
        database: "postgres",
        password: "postgres",
        port: 5432,
    });
    try {
        const res = await pool.query("SELECT NOW()");
        console.log("Connection successful: " + res.rows[0].now);
    } catch (e) {
        console.error("Connection failed: " + e.message);
    } finally {
        await pool.end();
    }
}
run();
