import { STYLE_FIELDS, type HouseStyle } from "../../lib/book-config";

/** The house-style choices, each with an example of what it means. */
export function StyleFields({ value, onChange, disabled }: { value: HouseStyle; onChange: (next: HouseStyle) => void; disabled?: boolean }) {
  return (
    <div className="style-fields">
      {STYLE_FIELDS.map(field => {
        const current = (value as Record<string, unknown>)[field.key];
        const chosen = field.choices.find(c => c.value === current);
        return (
          <label key={field.key} className="style-field">
            <span className="style-label">{field.label}</span>
            <select disabled={disabled} value={current == null ? "" : String(current)}
              onChange={e => {
                const raw = e.target.value;
                const v = raw === "" ? undefined : raw === "true" ? true : raw === "false" ? false : raw;
                onChange({ ...value, [field.key]: v } as HouseStyle);
              }}>
              <option value="">Not set</option>
              {field.choices.map(c => <option key={String(c.value)} value={String(c.value)}>{c.label}</option>)}
            </select>
            <span className="style-example">{chosen?.example ?? ""}</span>
          </label>
        );
      })}
    </div>
  );
}
