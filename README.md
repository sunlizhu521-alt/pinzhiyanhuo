# 品质验货

品质验货多人协作系统。正式使用建议部署到腾讯服务器，GitHub 只保存代码，业务数据和检验报告单文件统一保存在服务器。

## 角色流程

- 采购跟单员：进入“验货通知”，支持单条填写和批量上传历史通知。
- 孙立柱：最高管理员，可进入全部页面，负责验货安排、数据维护和历史导入。
- 验货员：进入“验货反馈”，只查看分配给自己的记录，填写反馈并上传检验报告单。
- 结算员：进入“检验报告单查询”和“验货信息汇总表”，只能查询，不能修改数据。

默认账号：

- 孙立柱 / 由服务器环境变量 ADMIN_PASSWORD 设置 / 管理员
- 采购跟单员 / 123456 / 采购跟单员
- 验货员 / 123456 / 验货员
- 结算员 / 123456 / 结算员

## 本地开发

```bash
npm install
npm run dev
```

前端默认由 Vite 启动，后端 API 默认端口为 `4002`。

## 腾讯服务器正式部署

服务器安装 Node.js、PM2、Nginx 后执行：

```bash
git clone https://github.com/sunlizhu521-alt/pinzhiyanhuo.git
cd pinzhiyanhuo
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

正式业务入口建议用服务器域名或 IP，例如：

```text
http://服务器IP/pinzhiyanhuo/
```

Nginx 反向代理示例：

```nginx
server {
  listen 80;
  server_name 你的域名或服务器IP;

  location / {
    proxy_pass http://127.0.0.1:4002;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 数据和文件

- 信息库：`data/db.json`
- 文件库：`data/uploads/`
- 检验报告单上传后按“检验报告单编码 + 原扩展名”保存，例如 `BG-20260622-001.jpg`
- `data/db.json`、`data/uploads/`、`backups/` 不提交到 GitHub

## 每日备份

手动备份：

```bash
npm run backup
```

Linux cron 示例，每天 02:00 备份，默认保留最近 30 份：

```bash
0 2 * * * cd /path/to/pinzhiyanhuo && /usr/bin/npm run backup >> backups/backup.log 2>&1
```

## GitHub Pages 预览

GitHub Pages 仅作为演示预览，不作为多人正式入口：

https://sunlizhu521-alt.github.io/pinzhiyanhuo/

Pages 版本使用浏览器本地存储，换电脑后数据不共享；正式多人协作请使用腾讯服务器入口。
