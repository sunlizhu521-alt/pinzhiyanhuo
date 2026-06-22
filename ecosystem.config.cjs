module.exports = {
  apps: [
    {
      name: 'pinzhiyanhuo',
      script: 'server/app.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 4002,
        DATA_DIR: './data',
        BACKUP_DIR: './backups'
      },
      max_memory_restart: '512M'
    }
  ]
};
