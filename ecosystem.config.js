module.exports = {
  apps: [
    {
      name: "pg-rental-api",
      script: "src/server.js", // change if needed
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3002
      }
    }
  ]
};
