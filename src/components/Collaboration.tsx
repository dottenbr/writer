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
  const otherEditors = activeEditors.filter((e) => e.userId !== userId);

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
    <div className="manage-card">
      {/* Online presence */}
      {otherEditors.length > 0 && (
        <div className="collab-presence-bar">
          {otherEditors.map((editor) => (
            <div key={editor.userId} className="collab-presence-chip">
              <span className="collab-presence-dot" />
              <span className="collab-presence-name">{editor.displayName || "Anonymous"}</span>
              <span className="collab-presence-where">
                {editor.activeTab}{editor.activeChapterId ? " \u00b7 editing" : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Members table */}
      <div className="collab-members">
        <div className="collab-members-header">
          <div className="manage-option-label">Members</div>
          <span className="collab-member-count">{projectMembers.length}</span>
        </div>
        <div className="collab-members-list">
          {projectMembers.map((member) => (
            <div key={member.id} className="collab-member-row">
              <div className="collab-member-identity">
                <span className="collab-member-avatar">
                  {(member.displayName || member.email).charAt(0).toUpperCase()}
                </span>
                <div className="collab-member-text">
                  <span className="collab-member-name">
                    {member.displayName || member.email}
                  </span>
                  {member.displayName && (
                    <span className="collab-member-email">{member.email}</span>
                  )}
                </div>
              </div>
              <span className="collab-role-badge" data-role={member.role}>
                {member.role}
              </span>
              {isOwner && member.userId !== userId && (
                <button
                  className="collab-remove-btn"
                  onClick={() => removeProjectMember(member.userId)}
                  title="Remove member"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invite form */}
      {isOwner && (
        <div className="collab-invite">
          <div className="manage-option-label">Invite</div>
          <form onSubmit={handleInvite} className="collab-invite-form">
            <input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input collab-invite-input"
              required
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="form-input collab-role-select"
            >
              <option value="viewer">Viewer (comment only)</option>
              <option value="editor">Editor (cowriter)</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
              {loading ? "Inviting\u2026" : "Invite"}
            </button>
          </form>
          {error && <p className="collab-feedback collab-error">{error}</p>}
          {success && <p className="collab-feedback collab-success">{success}</p>}
        </div>
      )}
    </div>
  );
}
