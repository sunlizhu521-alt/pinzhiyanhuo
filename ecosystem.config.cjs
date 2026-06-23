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
        BACKUP_DIR: './backups',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '请替换为真实密码'
      },
      max_memory_restart: '512M'
    }
  ]
};
