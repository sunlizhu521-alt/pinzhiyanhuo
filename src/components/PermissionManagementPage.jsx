import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ADMIN_USER, PAGE_OPTIONS } from '../constants.js';
import DataTable from './DataTable.jsx';

function PermissionManagementPage({ users, savingId, canDeleteUsers = false, onSave, onDelete, onCreateUser, onResetPassword }) {
  const [drafts, setDrafts] = useState({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const userNames = useMemo(() => new Set(users.map((user) => user.name)), [users]);

  useEffect(() => {
    setDrafts(Object.fromEntries(users.map((user) => [user.id, user.pageAccess || []])));
  }, [users]);

  function togglePage(userId, page, checked) {
    setDrafts((current) => {
      const selected = new Set(current[userId] || []);
      if (checked) selected.add(page);
      else selected.delete(page);
      return { ...current, [userId]: [...selected] };
    });
  }

  async function handleCreateUser() {
    const name = newUserName.trim();
    const password = newUserPassword.trim();
    setCreateError('');
    if (!name || !password) {
      setCreateError('姓名和密码不能为空');
      return;
    }
    if (userNames.has(name)) {
      setCreateError('该用户已存在');
      return;
    }
    const created = await onCreateUser(name, password);
    if (!created) return;
    setNewUserName('');
    setNewUserPassword('');
    setShowCreateForm(false);
  }

  return (
    <section className="permission-page">
      <div className="section-heading-row">
        <h2>权限管理</h2>
        {canDeleteUsers && (
          <button type="button" className="compact-button" onClick={() => setShowCreateForm((value) => !value)}>
            {showCreateForm ? '取消' : '创建用户'}
          </button>
        )}
        <span className="section-count">注册用户 {users.length} 个</span>
      </div>
      {canDeleteUsers && showCreateForm && (
        <div className="create-user-form" style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="姓名" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} />
          <input placeholder="密码" type="password" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} />
          <button type="button" className="compact-button" onClick={handleCreateUser} disabled={Boolean(savingId)}>创建</button>
          {createError && <span style={{ color: 'red' }}>{createError}</span>}
        </div>
      )}
      <DataTable
        className="permission-table"
        rows={users}
        columns={['用户', '角色', '可访问页面', '操作']}
        render={(targetUser) => {
          const selected = drafts[targetUser.id] || [];
          const isBuiltInAdmin = targetUser.name === DEFAULT_ADMIN_USER.name;
          return [
            targetUser.name,
            targetUser.role,
            <div className="permission-checkbox-grid">
              {PAGE_OPTIONS.map((page) => (
                <label key={page.tab} className="permission-checkbox">
                  <input
                    type="checkbox"
                    checked={selected.includes(page.tab)}
                    disabled={isBuiltInAdmin}
                    onChange={(event) => togglePage(targetUser.id, page.tab, event.target.checked)}
                  />
                  <span>{page.label}</span>
                </label>
              ))}
            </div>,
            <div className="table-action-row">
              <button
                type="button"
                className="compact-button"
                disabled={savingId === targetUser.id || isBuiltInAdmin}
                onClick={() => onSave(targetUser, selected)}
              >
                保存授权
              </button>
              {canDeleteUsers && !isBuiltInAdmin && (
                <>
                  <button
                    type="button"
                    className="danger-button compact-button"
                    disabled={savingId === targetUser.id}
                    onClick={() => onDelete(targetUser)}
                  >
                    删除账号
                  </button>
                  <button
                    type="button"
                    className="ghost compact-button"
                    disabled={savingId === targetUser.id}
                    onClick={() => onResetPassword(targetUser)}
                  >
                    重置密码
                  </button>
                </>
              )}
            </div>
          ];
        }}
      />
    </section>
  );
}

export default PermissionManagementPage;
