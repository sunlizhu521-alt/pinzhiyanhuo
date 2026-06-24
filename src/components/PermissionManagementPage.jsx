import { useEffect, useState } from 'react';
import { ROLE_ADMIN, DEFAULT_ADMIN_USER, PAGE_OPTIONS } from '../constants.js';
import { isAdminUser, isPrimaryAdminUser } from '../utils.js';
import { readStaticDb, saveStaticDb } from '../db-utils.js';
import DataTable from './DataTable.jsx';
import EmptyState from './EmptyState.jsx';

function PermissionManagementPage({ users, savingId, canDeleteUsers = false, onSave, onDelete }) {
  const [drafts, setDrafts] = useState({});

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

  return (
    <section className="permission-page">
      <div className="section-heading-row">
        <h2>权限管理</h2>
        <span className="section-count">注册用户 {users.length} 个</span>
      </div>
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
                <button
                  type="button"
                  className="danger-button compact-button"
                  disabled={savingId === targetUser.id}
                  onClick={() => onDelete(targetUser)}
                >
                  删除账号
                </button>
              )}
            </div>
          ];
        }}
      />
    </section>
  );
}

export default PermissionManagementPage;
