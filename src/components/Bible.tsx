import { type ChangeEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import type { BibleSection, Character, Thread, Location, CodexEntry } from "../types";
import { formatSectionPrefix, deriveChapterNumbers } from "../types";
import { completeText } from "../lib/llm-service";

function listToTextarea(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

function textareaToList(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function AutoResizeTextarea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="form-textarea"
      value={value}
      onChange={onChange}
      onInput={(e) => {
        const target = e.currentTarget;
        target.style.height = "auto";
        target.style.height = `${target.scrollHeight}px`;
      }}
      rows={rows}
      placeholder={placeholder}
      style={{ overflow: "hidden", resize: "none" }}
    />
  );
}

function EntryChevron({ open }: { open: boolean }) {
  return (
    <span className={`expand-chevron bible-entry-chevron${open ? " is-open" : ""}`} aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function CharacterEntry({ char, focused = false }: { char: Character; focused?: boolean }) {
  const updateCharacter = useProjectStore((s) => s.updateCharacter);
  const deleteCharacter = useProjectStore((s) => s.deleteCharacter);
  const allCharacters = useProjectStore((s) => s.currentProject()?.bible.characters ?? []);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const relationshipOptions: Array<{ value: Character["relationships"][number]["type"]; label: string }> = [
    { value: "family", label: "Family" },
    { value: "friendship", label: "Friendship" },
    { value: "romantic", label: "Romantic" },
    { value: "professional", label: "Professional" },
    { value: "mentor", label: "Mentor" },
    { value: "rivalry", label: "Rivalry" },
    { value: "conflict", label: "Conflict" },
    { value: "other", label: "Other" },
  ];

  const selectableCharacters = allCharacters.filter((candidate) => candidate.id !== char.id);
  const relationshipTypePriority: Record<Character["relationships"][number]["type"], number> = {
    romantic: 7,
    family: 6,
    mentor: 5,
    rivalry: 4,
    conflict: 3,
    professional: 2,
    friendship: 1,
    other: 0,
  };
  const normalizeRelationships = (relationships: Character["relationships"] = []) => {
    const deduped = new Map<string, Character["relationships"][number]>();
    for (const relationship of relationships) {
      const withCharacterId = relationship.withCharacterId?.trim();
      if (!withCharacterId) continue;

      const existing = deduped.get(withCharacterId);
      if (!existing) {
        deduped.set(withCharacterId, { ...relationship, withCharacterId });
        continue;
      }

      const currentPriority = relationshipTypePriority[relationship.type] ?? 0;
      const existingPriority = relationshipTypePriority[existing.type] ?? 0;
      if (currentPriority > existingPriority) {
        existing.type = relationship.type;
      }

      const existingParts = (existing.description ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      const incomingParts = (relationship.description ?? "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
      const merged = [...new Set([...existingParts, ...incomingParts])];
      existing.description = merged.join("; ");
    }
    return Array.from(deduped.values());
  };
  const relatedCharacterIds = new Set(
    normalizeRelationships(char.relationships ?? []).map((relationship) => relationship.withCharacterId)
  );
  const availableRelationshipTargets = selectableCharacters.filter(
    (candidate) => !relatedCharacterIds.has(candidate.id)
  );

  const setAlias = (index: number, value: string) => {
    const next = [...(char.alsoKnownAs ?? [])];
    next[index] = value;
    updateCharacter(char.id, { alsoKnownAs: next });
  };

  const addAlias = () => {
    updateCharacter(char.id, { alsoKnownAs: [...(char.alsoKnownAs ?? []), ""] });
  };

  const removeAlias = (index: number) => {
    const next = (char.alsoKnownAs ?? []).filter((_, i) => i !== index);
    updateCharacter(char.id, { alsoKnownAs: next });
  };

  const addRelationship = () => {
    const defaultTarget = availableRelationshipTargets[0]?.id ?? "";
    if (!defaultTarget) return;
    updateCharacter(char.id, {
      relationships: normalizeRelationships([
        ...(char.relationships ?? []),
        {
          id: crypto.randomUUID(),
          withCharacterId: defaultTarget,
          type: "other",
          description: "",
        },
      ]),
    });
  };

  const updateRelationship = (
    relationshipId: string,
    updates: Partial<Character["relationships"][number]>
  ) => {
    updateCharacter(char.id, {
      relationships: normalizeRelationships(
        (char.relationships ?? []).map((relationship) =>
          relationship.id === relationshipId ? { ...relationship, ...updates } : relationship
        )
      ),
    });
  };

  const removeRelationship = (relationshipId: string) => {
    updateCharacter(char.id, {
      relationships: (char.relationships ?? []).filter((relationship) => relationship.id !== relationshipId),
    });
  };

  useEffect(() => {
    if (!focused) return;
    setOpen(true);
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);

  return (
    <div className={`bible-entry${open ? " is-open" : ""}`} ref={containerRef}>
      <div className="bible-entry-header" onClick={() => setOpen(!open)}>
        <div className="bible-entry-header-main">
          <div className="bible-entry-name">{char.name}</div>
          <div className="bible-entry-role">{char.role}</div>
        </div>
        <EntryChevron open={open} />
      </div>
      {open && (
        <div className="bible-entry-body fade-enter">
          <div className="form-label" style={{ marginBottom: "0.5rem" }}>
            Identity
          </div>
          <div className="card-grid card-grid-2">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={char.name ?? ""}
                onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select
                className="form-select"
                value={char.role}
                onChange={(e) =>
                  updateCharacter(char.id, { role: e.target.value as Character["role"] })
                }
              >
                <option value="protagonist">Protagonist</option>
                <option value="antagonist">Antagonist</option>
                <option value="supporting">Supporting</option>
                <option value="minor">Minor</option>
                <option value="mentioned">Mentioned</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Age</label>
            <input
              className="form-input"
              value={char.age ?? ""}
              onChange={(e) => updateCharacter(char.id, { age: e.target.value })}
            />
          </div>
          <div className="form-group">
            <div className="flex-row items-center justify-between" style={{ marginBottom: "0.4rem" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                Also known as
              </label>
              <button className="btn btn-sm" type="button" onClick={addAlias}>
                + Add alias
              </button>
            </div>
            {(char.alsoKnownAs ?? []).length === 0 ? (
              <div className="form-label" style={{ color: "var(--text-muted)" }}>
                No aliases yet.
              </div>
            ) : (
              (char.alsoKnownAs ?? []).map((alias, index) => (
                <div
                  key={`${char.id}-alias-${index}`}
                  className="flex-row items-center gap-sm"
                  style={{ marginBottom: "0.5rem" }}
                >
                  <input
                    className="form-input"
                    value={alias}
                    placeholder="Alias or alternate name"
                    onChange={(e) => setAlias(index, e.target.value)}
                  />
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => removeAlias(index)}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="form-label" style={{ marginBottom: "0.5rem", marginTop: "1rem" }}>
            Inner life
          </div>
          <div className="form-group">
            <label className="form-label">Motivation</label>
            <input
              className="form-input"
              value={char.motivation ?? ""}
              onChange={(e) => updateCharacter(char.id, { motivation: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Personality</label>
            <AutoResizeTextarea
              value={char.personality ?? ""}
              onChange={(e) => updateCharacter(char.id, { personality: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Internal conflict</label>
            <AutoResizeTextarea
              value={char.internalConflict ?? ""}
              onChange={(e) => updateCharacter(char.id, { internalConflict: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Fears</label>
            <AutoResizeTextarea
              value={char.fears ?? ""}
              onChange={(e) => updateCharacter(char.id, { fears: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Hopes</label>
            <AutoResizeTextarea
              value={char.hopes ?? ""}
              onChange={(e) => updateCharacter(char.id, { hopes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="form-label" style={{ marginBottom: "0.5rem", marginTop: "1rem" }}>
            Capabilities
          </div>
          <div className="form-group">
            <label className="form-label">Strengths</label>
            <AutoResizeTextarea
              value={char.strengths ?? ""}
              onChange={(e) => updateCharacter(char.id, { strengths: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Weaknesses</label>
            <AutoResizeTextarea
              value={char.weaknesses ?? ""}
              onChange={(e) => updateCharacter(char.id, { weaknesses: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Physical presence</label>
            <AutoResizeTextarea
              value={char.physicalPresence ?? ""}
              onChange={(e) => updateCharacter(char.id, { physicalPresence: e.target.value })}
              rows={3}
            />
          </div>

          <div className="form-label" style={{ marginBottom: "0.5rem", marginTop: "1rem" }}>
            Epistemics
          </div>
          <div className="form-group">
            <label className="form-label">Knows</label>
            <AutoResizeTextarea
              value={char.knows ?? ""}
              onChange={(e) => updateCharacter(char.id, { knows: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Believes</label>
            <AutoResizeTextarea
              value={char.believes ?? ""}
              onChange={(e) => updateCharacter(char.id, { believes: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Conceals</label>
            <AutoResizeTextarea
              value={char.conceals ?? ""}
              onChange={(e) => updateCharacter(char.id, { conceals: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Blind spots</label>
            <AutoResizeTextarea
              value={char.blindSpots ?? ""}
              onChange={(e) => updateCharacter(char.id, { blindSpots: e.target.value })}
              rows={3}
            />
          </div>

          <div className="form-label" style={{ marginBottom: "0.5rem", marginTop: "1rem" }}>
            Narrative
          </div>
          <div className="form-group">
            <label className="form-label">Backstory</label>
            <AutoResizeTextarea
              value={char.backstory ?? ""}
              onChange={(e) => updateCharacter(char.id, { backstory: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Character Arc</label>
            <AutoResizeTextarea
              value={char.arc ?? ""}
              onChange={(e) => updateCharacter(char.id, { arc: e.target.value })}
              rows={2}
            />
          </div>
          <div className="form-group">
            <div className="flex-row items-center justify-between" style={{ marginBottom: "0.4rem" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                Relationships
              </label>
              <button
                className="btn btn-sm"
                type="button"
                onClick={addRelationship}
                disabled={availableRelationshipTargets.length === 0}
              >
                + Add relationship
              </button>
            </div>
            {selectableCharacters.length === 0 ? (
              <div className="form-label" style={{ color: "var(--text-muted)" }}>
                Add another character first to create relationships.
              </div>
            ) : availableRelationshipTargets.length === 0 && (char.relationships ?? []).length > 0 ? (
              <div className="form-label" style={{ color: "var(--text-muted)" }}>
                This character is already linked to every other character.
              </div>
            ) : (char.relationships ?? []).length === 0 ? (
              <div className="form-label" style={{ color: "var(--text-muted)" }}>
                No relationships yet.
              </div>
            ) : (
              (char.relationships ?? []).map((relationship) => (
                <div key={relationship.id} className="bible-entry" style={{ marginBottom: "0.75rem" }}>
                  <div className="bible-entry-body" style={{ padding: "0.75rem" }}>
                    <div className="card-grid card-grid-2">
                      <div className="form-group">
                        <label className="form-label">With</label>
                        <select
                          className="form-select"
                          value={relationship.withCharacterId}
                          onChange={(e) =>
                            updateRelationship(relationship.id, { withCharacterId: e.target.value })
                          }
                        >
                          {selectableCharacters.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Type</label>
                        <select
                          className="form-select"
                          value={relationship.type}
                          onChange={(e) =>
                            updateRelationship(relationship.id, {
                              type: e.target.value as Character["relationships"][number]["type"],
                            })
                          }
                        >
                          {relationshipOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Description</label>
                      <AutoResizeTextarea
                        value={relationship.description ?? ""}
                        onChange={(e) =>
                          updateRelationship(relationship.id, { description: e.target.value })
                        }
                        rows={2}
                      />
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      type="button"
                      onClick={() => removeRelationship(relationship.id)}
                    >
                      Remove relationship
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <AutoResizeTextarea
              value={char.description ?? ""}
              onChange={(e) => updateCharacter(char.id, { description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="form-label" style={{ marginBottom: "0.5rem", marginTop: "1rem" }}>
            Author
          </div>
          <div className="form-group">
            <label className="form-label">Drafting note</label>
            <AutoResizeTextarea
              value={char.draftingNote ?? ""}
              onChange={(e) => updateCharacter(char.id, { draftingNote: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <AutoResizeTextarea
              value={char.notes ?? ""}
              onChange={(e) => updateCharacter(char.id, { notes: e.target.value })}
              rows={2}
            />
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => deleteCharacter(char.id)}
          >
            Delete Character
          </button>
        </div>
      )}
    </div>
  );
}

function ThreadEntry({ thread, focused = false }: { thread: Thread; focused?: boolean }) {
  const updateThread = useProjectStore((s) => s.updateThread);
  const deleteThread = useProjectStore((s) => s.deleteThread);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setAlias = (index: number, value: string) => {
    const next = [...(thread.alsoKnownAs ?? [])];
    next[index] = value;
    updateThread(thread.id, { alsoKnownAs: next });
  };
  const addAlias = () => {
    updateThread(thread.id, { alsoKnownAs: [...(thread.alsoKnownAs ?? []), ""] });
  };
  const removeAlias = (index: number) => {
    const next = (thread.alsoKnownAs ?? []).filter((_, i) => i !== index);
    updateThread(thread.id, { alsoKnownAs: next });
  };

  useEffect(() => {
    if (!focused) return;
    setOpen(true);
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);

  return (
    <div className={`bible-entry${open ? " is-open" : ""}`} ref={containerRef}>
      <div className="bible-entry-header" onClick={() => setOpen(!open)}>
        <div className="bible-entry-header-main">
          <div className="bible-entry-name">{thread.name}</div>
          <div className="bible-entry-role">{thread.type}</div>
        </div>
        <EntryChevron open={open} />
      </div>
      {open && (
        <div className="bible-entry-body fade-enter">
          <div className="card-grid card-grid-2">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={thread.name}
                onChange={(e) => updateThread(thread.id, { name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="form-select"
                value={thread.type}
                onChange={(e) =>
                  updateThread(thread.id, { type: e.target.value as Thread["type"] })
                }
              >
                <option value="main">Main Plot</option>
                <option value="subplot">Subplot</option>
                <option value="thematic">Thematic</option>
                <option value="mystery">Mystery</option>
                <option value="romance">Romance</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <div className="flex-row items-center justify-between" style={{ marginBottom: "0.4rem" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                Also known as
              </label>
              <button className="btn btn-sm" type="button" onClick={addAlias}>
                + Add alias
              </button>
            </div>
            {(thread.alsoKnownAs ?? []).length === 0 ? (
              <div className="form-label" style={{ color: "var(--text-muted)" }}>
                No aliases yet.
              </div>
            ) : (
              (thread.alsoKnownAs ?? []).map((alias, index) => (
                <div
                  key={`${thread.id}-alias-${index}`}
                  className="flex-row items-center gap-sm"
                  style={{ marginBottom: "0.5rem" }}
                >
                  <input
                    className="form-input"
                    value={alias}
                    placeholder="Alias or alternate name"
                    onChange={(e) => setAlias(index, e.target.value)}
                  />
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => removeAlias(index)}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Timeframe</label>
            <input
              className="form-input"
              placeholder="e.g. 1935-1945"
              value={thread.timeframe ?? ""}
              onChange={(e) => updateThread(thread.id, { timeframe: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={thread.description}
              onChange={(e) => updateThread(thread.id, { description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Historical Anchors (one per line)</label>
            <textarea
              className="form-textarea"
              value={listToTextarea(thread.historicalAnchors)}
              onChange={(e) =>
                updateThread(thread.id, { historicalAnchors: textareaToList(e.target.value) })
              }
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Continuity Checks</label>
            <textarea
              className="form-textarea"
              value={thread.continuityChecks ?? ""}
              onChange={(e) => updateThread(thread.id, { continuityChecks: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Resolution</label>
            <textarea
              className="form-textarea"
              value={thread.resolution}
              onChange={(e) => updateThread(thread.id, { resolution: e.target.value })}
              rows={2}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Sources (one file per line)</label>
            <textarea
              className="form-textarea"
              value={listToTextarea(thread.sources)}
              onChange={(e) => updateThread(thread.id, { sources: textareaToList(e.target.value) })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              value={thread.notes}
              onChange={(e) => updateThread(thread.id, { notes: e.target.value })}
              rows={2}
            />
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => deleteThread(thread.id)}>
            Delete Thread
          </button>
        </div>
      )}
    </div>
  );
}

function LocationEntry({ location, focused = false }: { location: Location; focused?: boolean }) {
  const updateLocation = useProjectStore((s) => s.updateLocation);
  const deleteLocation = useProjectStore((s) => s.deleteLocation);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setAlias = (index: number, value: string) => {
    const next = [...(location.alsoKnownAs ?? [])];
    next[index] = value;
    updateLocation(location.id, { alsoKnownAs: next });
  };
  const addAlias = () => {
    updateLocation(location.id, { alsoKnownAs: [...(location.alsoKnownAs ?? []), ""] });
  };
  const removeAlias = (index: number) => {
    const next = (location.alsoKnownAs ?? []).filter((_, i) => i !== index);
    updateLocation(location.id, { alsoKnownAs: next });
  };

  useEffect(() => {
    if (!focused) return;
    setOpen(true);
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);

  return (
    <div className={`bible-entry${open ? " is-open" : ""}`} ref={containerRef}>
      <div className="bible-entry-header" onClick={() => setOpen(!open)}>
        <div className="bible-entry-header-main">
          <div className="bible-entry-name">{location.name}</div>
        </div>
        <EntryChevron open={open} />
      </div>
      {open && (
        <div className="bible-entry-body fade-enter">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={location.name}
              onChange={(e) => updateLocation(location.id, { name: e.target.value })}
            />
          </div>
          <div className="form-group">
            <div className="flex-row items-center justify-between" style={{ marginBottom: "0.4rem" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                Also known as
              </label>
              <button className="btn btn-sm" type="button" onClick={addAlias}>
                + Add alias
              </button>
            </div>
            {(location.alsoKnownAs ?? []).length === 0 ? (
              <div className="form-label" style={{ color: "var(--text-muted)" }}>
                No aliases yet.
              </div>
            ) : (
              (location.alsoKnownAs ?? []).map((alias, index) => (
                <div
                  key={`${location.id}-alias-${index}`}
                  className="flex-row items-center gap-sm"
                  style={{ marginBottom: "0.5rem" }}
                >
                  <input
                    className="form-input"
                    value={alias}
                    placeholder="Alias or alternate name"
                    onChange={(e) => setAlias(index, e.target.value)}
                  />
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => removeAlias(index)}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Timeframe</label>
            <input
              className="form-input"
              placeholder="e.g. 1947-1957"
              value={location.timeframe ?? ""}
              onChange={(e) => updateLocation(location.id, { timeframe: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Geographical Context</label>
            <textarea
              className="form-textarea"
              value={location.geoContext ?? ""}
              onChange={(e) => updateLocation(location.id, { geoContext: e.target.value })}
              rows={2}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={location.description}
              onChange={(e) => updateLocation(location.id, { description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Significance</label>
            <textarea
              className="form-textarea"
              value={location.significance}
              onChange={(e) => updateLocation(location.id, { significance: e.target.value })}
              rows={2}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Historical Context</label>
            <textarea
              className="form-textarea"
              value={location.historicalContext ?? ""}
              onChange={(e) => updateLocation(location.id, { historicalContext: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Sensory Details</label>
            <textarea
              className="form-textarea"
              placeholder="Sights, sounds, smells, textures..."
              value={location.sensoryDetails}
              onChange={(e) => updateLocation(location.id, { sensoryDetails: e.target.value })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Sources (one file per line)</label>
            <textarea
              className="form-textarea"
              value={listToTextarea(location.sources)}
              onChange={(e) => updateLocation(location.id, { sources: textareaToList(e.target.value) })}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              value={location.notes}
              onChange={(e) => updateLocation(location.id, { notes: e.target.value })}
              rows={2}
            />
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => deleteLocation(location.id)}>
            Delete Location
          </button>
        </div>
      )}
    </div>
  );
}

function CodexEntryComponent({ entry, focused = false }: { entry: CodexEntry; focused?: boolean }) {
  const updateCodexEntry = useProjectStore((s) => s.updateCodexEntry);
  const deleteCodexEntry = useProjectStore((s) => s.deleteCodexEntry);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const setAlias = (index: number, value: string) => {
    const next = [...(entry.alsoKnownAs ?? [])];
    next[index] = value;
    updateCodexEntry(entry.id, { alsoKnownAs: next });
  };
  const addAlias = () => {
    updateCodexEntry(entry.id, { alsoKnownAs: [...(entry.alsoKnownAs ?? []), ""] });
  };
  const removeAlias = (index: number) => {
    const next = (entry.alsoKnownAs ?? []).filter((_, i) => i !== index);
    updateCodexEntry(entry.id, { alsoKnownAs: next });
  };

  useEffect(() => {
    if (!focused) return;
    setOpen(true);
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focused]);

  return (
    <div className={`bible-entry${open ? " is-open" : ""}`} ref={containerRef}>
      <div className="bible-entry-header" onClick={() => setOpen(!open)}>
        <div className="bible-entry-header-main">
          <div className="bible-entry-name">{entry.name}</div>
          <div className="bible-entry-role">{entry.category}</div>
        </div>
        <EntryChevron open={open} />
      </div>
      {open && (
        <div className="bible-entry-body fade-enter">
          <div className="card-grid card-grid-2">
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={entry.name}
                onChange={(e) => updateCodexEntry(entry.id, { name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input
                className="form-input"
                placeholder="Magic, Technology, Culture..."
                value={entry.category}
                onChange={(e) => updateCodexEntry(entry.id, { category: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <div className="flex-row items-center justify-between" style={{ marginBottom: "0.4rem" }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                Also known as
              </label>
              <button className="btn btn-sm" type="button" onClick={addAlias}>
                + Add alias
              </button>
            </div>
            {(entry.alsoKnownAs ?? []).length === 0 ? (
              <div className="form-label" style={{ color: "var(--text-muted)" }}>
                No aliases yet.
              </div>
            ) : (
              (entry.alsoKnownAs ?? []).map((alias, index) => (
                <div
                  key={`${entry.id}-alias-${index}`}
                  className="flex-row items-center gap-sm"
                  style={{ marginBottom: "0.5rem" }}
                >
                  <input
                    className="form-input"
                    value={alias}
                    placeholder="Alias or alternate name"
                    onChange={(e) => setAlias(index, e.target.value)}
                  />
                  <button className="btn btn-danger btn-sm" type="button" onClick={() => removeAlias(index)}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="card-grid card-grid-2">
            <div className="form-group">
              <label className="form-label">Entry Type</label>
              <select
                className="form-select"
                value={entry.entryType ?? "term"}
                onChange={(e) =>
                  updateCodexEntry(entry.id, {
                    entryType: e.target.value as CodexEntry["entryType"],
                  })
                }
              >
                <option value="event">Event</option>
                <option value="institution">Institution</option>
                <option value="term">Term</option>
                <option value="person">Person</option>
                <option value="timeline">Timeline</option>
                <option value="doctrine">Doctrine</option>
                <option value="constraint">Constraint</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Timeframe</label>
              <input
                className="form-input"
                placeholder="e.g. 1935, 1947-1957"
                value={entry.timeframe ?? ""}
                onChange={(e) => updateCodexEntry(entry.id, { timeframe: e.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Content</label>
            <textarea
              className="form-textarea"
              value={entry.content}
              onChange={(e) => updateCodexEntry(entry.id, { content: e.target.value })}
              rows={6}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Sources (one file per line)</label>
            <textarea
              className="form-textarea"
              value={listToTextarea(entry.sources)}
              onChange={(e) => updateCodexEntry(entry.id, { sources: textareaToList(e.target.value) })}
              rows={3}
            />
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => deleteCodexEntry(entry.id)}>
            Delete Entry
          </button>
        </div>
      )}
    </div>
  );
}

const SECTIONS: { id: BibleSection; label: string; sublabel: string }[] = [
  { id: "characters", label: "Characters", sublabel: "People & beings" },
  { id: "threads", label: "Threads", sublabel: "Plot lines" },
  { id: "locations", label: "Locations", sublabel: "Places & settings" },
  { id: "codex", label: "Codex", sublabel: "Facts, rules & lore" },
];

export function Bible() {
  const project = useProjectStore((s) => s.currentProject());
  const section = useProjectStore((s) => s.activeBibleSection);
  const setSection = useProjectStore((s) => s.setActiveBibleSection);
  const focusedBibleEntryId = useProjectStore((s) => s.focusedBibleEntryId);
  const clearFocusedBibleEntry = useProjectStore((s) => s.clearFocusedBibleEntry);
  const addCharacter = useProjectStore((s) => s.addCharacter);
  const addThread = useProjectStore((s) => s.addThread);
  const addLocation = useProjectStore((s) => s.addLocation);
  const addCodexEntry = useProjectStore((s) => s.addCodexEntry);
  const refreshBibleFromManuscript = useProjectStore((s) => s.refreshBibleFromManuscript);
  const llmSettings = useProjectStore((s) => s.llmSettings);

  if (!project) return null;
  const { bible } = project;

  const addActions: Record<BibleSection, () => void> = {
    characters: addCharacter,
    threads: addThread,
    locations: addLocation,
    codex: addCodexEntry,
  };

  const counts: Record<BibleSection, number> = {
    characters: bible.characters.length,
    threads: bible.threads.length,
    locations: bible.locations.length,
    codex: bible.codex.length,
  };

  useEffect(() => {
    if (!focusedBibleEntryId) return;
    let isVisibleInCurrentSection = false;
    if (section === "characters") {
      isVisibleInCurrentSection = bible.characters.some((entry) => entry.id === focusedBibleEntryId);
    } else if (section === "threads") {
      isVisibleInCurrentSection = bible.threads.some((entry) => entry.id === focusedBibleEntryId);
    } else if (section === "locations") {
      isVisibleInCurrentSection = bible.locations.some((entry) => entry.id === focusedBibleEntryId);
    } else if (section === "codex") {
      isVisibleInCurrentSection = bible.codex.some((entry) => entry.id === focusedBibleEntryId);
    }
    if (!isVisibleInCurrentSection) return;
    const timeout = window.setTimeout(() => clearFocusedBibleEntry(), 900);
    return () => window.clearTimeout(timeout);
  }, [focusedBibleEntryId, section, bible, clearFocusedBibleEntry]);

  return (
    <div className="main-area">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">Bible</div>
        </div>
        <div className="sidebar-content">
          <div className="bible-nav">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`bible-nav-item ${section === s.id ? "active" : ""}`}
                onClick={() => setSection(s.id)}
              >
                <div>
                  {s.label}
                  <span className="nav-label">
                    {s.sublabel} &middot; {counts[s.id]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="content">
        <div className="content-narrow">
          <div className="flex-row items-center justify-between mb-lg">
            <div className="page-title page-title-tight">
              {SECTIONS.find((s) => s.id === section)?.label}
            </div>
            <div className="flex-row gap-sm">
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const project = useProjectStore.getState().currentProject();
                  if (!project || project.chapters.length === 0) return;
                  const sorted = [...project.chapters].sort((a, b) => a.number - b.number);
                  const chNums = deriveChapterNumbers(sorted);
                  const source = sorted
                    .map((ch) => `${formatSectionPrefix(ch.sectionType, chNums.get(ch.id) ?? null)} ${ch.title}: ${ch.summary || ch.content.slice(0, 400)}`)
                    .join("\n\n");
                  const notes = await completeText(
                    `Extract continuity notes for characters, locations and plot threads from this manuscript and return concise markdown bullet points.\n\n${source}`,
                    llmSettings
                  );
                  refreshBibleFromManuscript(notes);
                }}
              >
                Refresh Bible
              </button>
              <button className="btn btn-primary" onClick={addActions[section]}>
                + Add {section === "codex" ? "Entry" : SECTIONS.find((s) => s.id === section)?.label.slice(0, -1)}
              </button>
            </div>
          </div>

          {section === "characters" &&
            (bible.characters.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No characters yet</div>
                <div className="empty-state-text">
                  Add characters to track their arcs, relationships, and details.
                </div>
              </div>
            ) : (
              bible.characters.map((c) => (
                <CharacterEntry
                  key={c.id}
                  char={c}
                  focused={section === "characters" && focusedBibleEntryId === c.id}
                />
              ))
            ))}

          {section === "threads" &&
            (bible.threads.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No threads yet</div>
                <div className="empty-state-text">
                  Track your plot lines, subplots, and thematic threads.
                </div>
              </div>
            ) : (
              bible.threads.map((t) => (
                <ThreadEntry
                  key={t.id}
                  thread={t}
                  focused={section === "threads" && focusedBibleEntryId === t.id}
                />
              ))
            ))}

          {section === "locations" &&
            (bible.locations.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No locations yet</div>
                <div className="empty-state-text">
                  Build your world with detailed settings and places.
                </div>
              </div>
            ) : (
              bible.locations.map((l) => (
                <LocationEntry
                  key={l.id}
                  location={l}
                  focused={section === "locations" && focusedBibleEntryId === l.id}
                />
              ))
            ))}

          {section === "codex" &&
            (bible.codex.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No codex entries yet</div>
                <div className="empty-state-text">
                  Use the codex to track facts, rules, magic systems, and world-building details.
                </div>
              </div>
            ) : (
              bible.codex.map((e) => (
                <CodexEntryComponent
                  key={e.id}
                  entry={e}
                  focused={section === "codex" && focusedBibleEntryId === e.id}
                />
              ))
            ))}
        </div>
      </div>
    </div>
  );
}
