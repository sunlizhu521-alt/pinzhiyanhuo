function SecurityWatermark({ user }) {
  const name = user?.name || '未登录用户';
  const date = new Date().toLocaleDateString('zh-CN');
  const text = `内部资料 ${name} ${date}`;
  return <div className="security-watermark">{text}</div>;
}

export default SecurityWatermark;
