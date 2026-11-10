import { updateProjectMemberRole, createInviteLink, emailInvite } from "../lib/supabase-service";
import { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { useAuthStore } from "../store/useAuthStore";

export function Collaboration() {
  const {
    projectMembers,
    currentProjectRole,
    inviteUser,
    removeProjectMember,
    activeEditors,
  } = useProjectStore();
  const { userId } = useAuthStore();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"coauthor" | "editor" | "viewer">("editor");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const isOwner = currentProjectRole === "owner";
  const otherEditors = activeEditors.filter((e) => e.userId !== userId);

  const [linkBusy, setLinkBusy] = useState("");
  const [linkNote, setLinkNote] = useState("");
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await inviteUser(email.trim(), role);
      setSuccess(`Access prepared for ${email} as ${role}. They can accept by signing in with that email. No email was sent.`);
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
              {isOwner && member.userId!==userId ? <select aria-label={`Role for ${member.email}`} value={member.role} onChange={async e=>{
                try{await updateProjectMemberRole(useProjectStore.getState().currentProjectId!,member.userId,e.target.value as 'coauthor'|'editor'|'viewer');await useProjectStore.getState().refreshMembers();setError('');}catch(err){setError((err as Error).message);}
              }}><option value="editor">Editor</option><option value="coauthor">Co-author</option><option value="viewer">Viewer</option></select> : <span className="collab-role-badge" data-role={member.role}>
                {member.role}{member.pending ? " · pending sign-in" : ""}
              </span>}
              {member.pending && isOwner && (
                <button className="btn btn-sm collab-link-btn" disabled={linkBusy === member.email} onClick={async () => {
                  setLinkBusy(member.email); setError(""); setLinkNote("");
                  try {
                    const link = await createInviteLink(useProjectStore.getState().currentProjectId!, member.email);
                    try { await navigator.clipboard.writeText(link); setLinkNote(`Sign-in link for ${member.email} copied. Send it to them yourself; it works once and expires in 24 hours.`); }
                    catch { setLinkNote(link); }
                  } catch (err) { setError((err as Error).message); } finally { setLinkBusy(""); }
                }}>{linkBusy === member.email ? "Creating…" : "Copy sign-in link"}</button>
              )}
              {member.pending && isOwner && (
                <button className="btn btn-sm collab-link-btn" disabled={linkBusy === member.email} onClick={async () => {
                  if (!confirm(`Email an invitation with a sign-in link to ${member.email}?`)) return;
                  setLinkBusy(member.email); setError(""); setLinkNote("");
                  try { await emailInvite(useProjectStore.getState().currentProjectId!, member.email); setLinkNote(`Invitation emailed to ${member.email}.`); }
                  catch (err) { setError((err as Error).message); } finally { setLinkBusy(""); }
                }}>Email invitation</button>
              )}
              {isOwner && member.userId !== userId && (
                <button
                  className="collab-remove-btn"
                  onClick={() => void removeProjectMember(member.userId).catch(e=>setError(e.message))}
                  title="Remove member"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {linkNote && <p className="collab-link-note" role="status">{linkNote}</p>}
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
              onChange={(e) => setRole(e.target.value as "coauthor" | "editor" | "viewer")}
              className="form-input collab-role-select"
            >
              <option value="viewer">Viewer (comment only)</option>
              <option value="editor">Editor</option>
              <option value="coauthor">Co-author</option>
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
