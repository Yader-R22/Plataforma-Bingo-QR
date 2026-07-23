module.exports = {
  apps: [
    {
      name: "elbingote-api",
      script: "./artifacts/api-server/dist/index.js",
      node_args: "--max-old-space-size=256",
      env: {
        NODE_ENV: "production",
        PORT: "8080",
      },
      max_memory_restart: "300M",
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
    },
  ],
};
