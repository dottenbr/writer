import { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";

export function Collaboration() {
  const {
    projectMembers,
    currentProjectRole,
    inviteUser,
    removeProjectMember,
    activeEditors,
    userId,
  } = useProjectStore();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const isOwner = currentProjectRole === "owner";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await inviteUser(email.trim(), role);
      setSuccess(`Invited ${email} as ${role}`);
      setEmail("");
    } catch (err: any) {
      setError(err?.message || "Failed to invite user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="collaboration-panel">
      <h3>Collaboration</h3>

      {/* Active editors */}
      {activeEditors.length > 0 && (
        <div className="collab-section">
          <h4>Currently Online</h4>
          <ul className="collab-presence-list">
            {activeEditors
              .filter((e) => e.userId !== userId)
              .map((editor) => (
                <li key={editor.userId} className="collab-presence-item">
                  <span className="collab-presence-dot" />
                  <span>{editor.displayName || "Anonymous"}</span>
                  <span className="collab-presence-tab">
                    {editor.activeTab}
                    {editor.activeChapterId ? " (editing)" : ""}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Members list */}
      <div className="collab-section">
        <h4>Project Members</h4>
        <ul className="collab-members-list">
          {projectMembers.map((member) => (
            <li key={member.id} className="collab-member-item">
              <div className="collab-member-info">
                <span className="collab-member-name">
                  {member.displayName || member.email}
                </span>
                <span className="collab-member-role">{member.role}</span>
              </div>
              {isOwner && member.userId !== userId && (
                <button
                  className="collab-remove-btn"
                  onClick={() => removeProjectMember(member.userId)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Invite form (owner only) */}
      {isOwner && (
        <div className="collab-section">
          <h4>Invite User</h4>
          <form onSubmit={handleInvite} className="collab-invite-form">
            <input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="collab-invite-input"
              required
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="collab-role-select"
            >
              <option value="viewer">Read-only (can comment)</option>
              <option value="editor">Editor (cowriter)</option>
            </select>
            <button type="submit" className="collab-invite-btn" disabled={loading}>
              {loading ? "Inviting..." : "Invite"}
            </button>
          </form>
          {error && <p className="collab-error">{error}</p>}
          {success && <p className="collab-success">{success}</p>}
        </div>
      )}

      {/* Role info */}
      <div className="collab-section collab-info">
        <h4>Permission Levels</h4>
        <ul>
          <li><strong>Owner:</strong> Full access, manage members</li>
          <li><strong>Editor:</strong> Read and write all project data (cowriter)</li>
          <li><strong>Viewer:</strong> Read-only access, can add comments</li>
        </ul>
      </div>
    </div>
  );
}
