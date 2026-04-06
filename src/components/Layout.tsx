import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { TabId } from "../types";

const Brief = lazy(() => import("./Brief").then((mod) => ({ default: mod.Brief })));
const ChapterPlan = lazy(() => import("./ChapterPlan").then((mod) => ({ default: mod.ChapterPlan })));
const Bible = lazy(() => import("./Bible").then((mod) => ({ default: mod.Bible })));
const Manuscript = lazy(() => import("./Manuscript").then((mod) => ({ default: mod.Manuscript })));
const ApiSettingsModal = lazy(() => import("./ApiSettingsModal").then((mod) => ({ default: mod.ApiSettingsModal })));
const Manage = lazy(() => import("./Manage").then((mod) => ({ default: mod.Manage })));
const Inspiration = lazy(() => import("./Inspiration").then((mod) => ({ default: mod.Inspiration })));


const TABS: { id: TabId; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "plan", label: "Chapter Plan" },
  { id: "bible", label: "Bible" },
  { id: "manuscript", label: "Manuscript" },
  { id: "inspiration", label: "Inspiration" },
  { id: "manage", label: "Manage" },
];

function ProjectSwitcher() {
  const projects = useProjectStore((s) => s.projects);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const switchProject = useProjectStore((s) => s.switchProject);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const renameProject = useProjectStore((s) => s.renameProject);
  const setShowProjectSwitcher = useProjectStore((s) => s.setShowProjectSwitcher);
  const show = useProjectStore((s) => s.showProjectSwitcher);
  const ref = useRef<HTMLDivElement>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowProjectSwitcher(false);
      }
    }
    if (show) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [show]);

  const currentProject = projects.find((p) => p.id === currentProjectId);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className={`project-switcher-btn ${show ? "open" : ""}`}
        onClick={() => setShowProjectSwitcher(!show)}
      >
        <svg className="project-switcher-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {currentProject?.name || "No Project"}
      </button>

      {show && (
        <div className="project-dropdown">
          <div className="project-dropdown-title">Projects</div>
          {projects.map((p) => (
            <div
              key={p.id}
              className={`project-list-item ${p.id === currentProjectId ? "current" : ""}`}
              onClick={() => {
                switchProject(p.id);
                setShowProjectSwitcher(false);
              }}
              onDoubleClick={() => {
                setEditingId(p.id);
                setEditName(p.name);
              }}
            >
              {editingId === p.id ? (
                <input
                  className="form-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => {
                    if (editName.trim()) renameProject(p.id, editName.trim());
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (editName.trim()) renameProject(p.id, editName.trim());
                      setEditingId(null);
                    }
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  style={{ padding: "4px 8px", fontSize: "0.88rem" }}
                />
              ) : (
                <>
                  <span className="project-name">{p.name}</span>
                  {p.id === currentProjectId && (
                    <span className="badge">current</span>
                  )}
                </>
              )}
            </div>
          ))}

          <div className="project-dropdown-actions">
            <input
              className="form-input"
              placeholder="New project name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  void createProject(newName.trim());
                  setNewName("");
                  setShowProjectSwitcher(false);
                }
              }}
              style={{ flex: 1, padding: "6px 10px", fontSize: "0.85rem" }}
            />
            <button
              className="btn btn-sm"
              onClick={() => {
                if (newName.trim()) {
                  void createProject(newName.trim());
                  setNewName("");
                  setShowProjectSwitcher(false);
                }
              }}
            >
              + New
            </button>
            {projects.length > 1 && currentProjectId && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (confirm("Delete this project? This cannot be undone.")) {
                    void deleteProject(currentProjectId);
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SaveIndicator() {
  const dirty = useProjectStore((s) => s.dirty);
  const lastSaved = useProjectStore((s) => s.lastSaved);
  const saveToStorage = useProjectStore((s) => s.saveToStorage);
  const syncStatus = useProjectStore((s) => s.syncStatus);

  return (
    <div className="save-indicator" style={{ cursor: "pointer" }} onClick={() => void saveToStorage()}>
      <span className={`save-dot ${dirty ? "dirty" : ""}`} />
      {dirty ? "Unsaved changes" : lastSaved ? `Saved · ${syncStatus}` : syncStatus}
    </div>
  );
}

export function Layout() {
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const saveToStorage = useProjectStore((s) => s.saveToStorage);
  const currentProject = useProjectStore((s) => s.currentProject());
  const createProject = useProjectStore((s) => s.createProject);
  const importProjectZip = useProjectStore((s) => s.importProjectZip);
  const showApiSettings = useProjectStore((s) => s.showApiSettings);
  const setShowApiSettings = useProjectStore((s) => s.setShowApiSettings);
  const focusMode = useProjectStore((s) => s.focusMode);
  const currentProjectRole = useProjectStore((s) => s.currentProjectRole);
  const [newProjectName, setNewProjectName] = useState("");
  const hasProject = !!currentProject;
  const canEdit = currentProjectRole === "owner" || currentProjectRole === "editor";

  function renderActiveTab() {
    switch (activeTab) {
      case "brief":
        return <Brief />;
      case "plan":
        return <ChapterPlan />;
      case "bible":
        return <Bible />;
      case "manuscript":
        return <Manuscript />;
      case "inspiration":
        return <Inspiration />;
      case "manage":
        return <Manage />;
      default:
        return null;
    }
  }

  return (
    <div className="layout">
      {!focusMode && <div className="topbar">
        <div className="topbar-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <span className="topbar-logo-text">Writer</span>
        </div>

        <div className="topbar-divider" />

        <ProjectSwitcher />

        <div className="topbar-divider" />

        <div className="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? "active" : ""} ${!hasProject ? "disabled" : ""}`}
              onClick={() => hasProject && setActiveTab(tab.id)}
              disabled={!hasProject}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="topbar-actions">
          {hasProject && <SaveIndicator />}
          {hasProject && canEdit && (
            <button className="btn btn-sm" onClick={() => void saveToStorage()}>
              Save ({navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+S)
            </button>
          )}
        </div>
      </div>}

      <div className="main-area">
        {!hasProject ? (
          <div className="content">
            <div className="content-narrow">
              <div className="empty-state">
                <div className="empty-state-title">No project yet</div>
                <div className="empty-state-text">
                  Create a new writing project, open an existing folder, or import from a ZIP backup.
                </div>
                <div className="card" style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}>
                  <div className="card-title" style={{ fontSize: "1rem" }}>Create New Project</div>
                  <div className="project-dropdown-actions" style={{ marginTop: 10 }}>
                    <input
                      className="form-input"
                      placeholder="Project name (e.g. Sarre)"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newProjectName.trim()) {
                          void createProject(newProjectName.trim());
                          setNewProjectName("");
                        }
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        if (!newProjectName.trim()) return;
                        void createProject(newProjectName.trim());
                        setNewProjectName("");
                      }}
                    >
                      Create
                    </button>
                  </div>
                  <div
                    className="text-muted"
                    style={{
                      textAlign: "center",
                      fontSize: "0.82rem",
                      margin: "12px 0",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    or
                  </div>
                  <div className="manage-actions">
                    <button className="btn" onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".zip";
                      input.onchange = async () => {
                        const file = input.files?.[0];
                        if (file) {
                          const data = new Uint8Array(await file.arrayBuffer());
                          await importProjectZip(data);
                        }
                      };
                      input.click();
                    }}>
                      Import ZIP
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="content">
                <div className="content-narrow">
                  <div className="card" style={{ padding: 16 }}>Loading…</div>
                </div>
              </div>
            }
          >
            {renderActiveTab()}
          </Suspense>
        )}
      </div>
      {showApiSettings && (
        <Suspense fallback={null}>
          <ApiSettingsModal onClose={() => setShowApiSettings(false)} />
        </Suspense>
      )}
    </div>
  );
}
