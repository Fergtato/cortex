import { PageFrame, useSettings } from "@cortex/core";
import { Grid, Icon, Panel, Toggle } from "@cortex/ui";
import { HOME_ID, MODULES } from "../modules";

export function ModuleSettings() {
  const { settings, update } = useSettings();
  const off = new Set(settings.disabledModules);
  const set = (id: string, on: boolean) => {
    const next = new Set(off);
    if (on) next.delete(id);
    else next.add(id);
    update({ disabledModules: [...next] });
  };
  return (
    <PageFrame crumbs={["Settings", "Apps"]} title="Apps" subtitle="Switch apps off to hide them from the rail. Their data is kept.">
      <Grid>
        <Panel span={12} flush>
          <ul className="settings-list">
            {MODULES.filter((m) => !m.hidden).map((m) => (
              <li key={m.id}>
                <Icon name={m.icon} size={16} />
                <span className="settings-list__label">{m.name}</span>
                {m.id === HOME_ID ? (
                  <span className="cx-label">Always on</span>
                ) : (
                  <Toggle checked={!off.has(m.id)} onChange={(on) => set(m.id, on)} label={off.has(m.id) ? "Off" : "On"} />
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </Grid>
    </PageFrame>
  );
}
