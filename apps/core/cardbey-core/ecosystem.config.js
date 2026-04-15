/**
 * PM2 Ecosystem Configuration
 * Production deployment for Cardbey Core
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 logs
 *   pm2 status
 *   pm2 stop all
 *   pm2 restart all
 */

module.exports = {
  apps: [
    {
      name: 'cardbey-api',
      script: 'src/server.js',
      env: {
        ROLE: 'api',
        PORT: 3001,
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork', // 'cluster' for multiple instances
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'cardbey-worker',
      script: 'src/worker.js',
      env: {
        ROLE: 'worker',
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      merge_logs: true
    }
  ]
};






