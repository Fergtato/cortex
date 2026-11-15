import { useState } from "react";
import { PageFrame, useSettings } from "@cortex/core";
import { Button, Grid, Icon, Panel, Toggle } from "@cortex/ui";
import { HOME_ID, orderModules } from "../modules";

export function ModuleSettings() {
  const { settings, update } = useSettings();
  const off = new Set(settings.disabledModules);
  const mods = orderModules(settings.appOrder).filter((m) => !m.hidden);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const set = (id: string, on: boolean) => {
    const next = new Set(off);
    if (on) next.delete(id);
    else next.add(id);
    update({ disabledModules: [...next] });
  };
  const save = (ids: string[]) => update({ appOrder: ids });
  const move = (id: string, by: number) => {
    const ids = mods.map((m) => m.id);
    const i = ids.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    save(ids);
  };
  const dropOn = (target: string) => {
    if (!dragId || dragId === target) return;
    const ids = mods.map((m) => m.id).filter((x) => x !== dragId);
    ids.splice(ids.indexOf(target) + (mods.findIndex((m) => m.id === dragId) < mods.findIndex((m) => m.id === target) ? 1 : 0), 0, dragId);
    save(ids);
  };

  return (
    <PageFrame crumbs={["Settings", "Apps"]} title="Apps" subtitle="Drag to reorder the app rail. Switch apps off to hide them; their data is kept.">
      <Grid>
        <Panel span={12} flush>
          <ul className="settings-list">
            {mods.map((m, i) => (
              <li
                key={m.id}
                className={`settings-app${dragId === m.id ? " is-dragging" : ""}${overId === m.id && dragId !== m.id ? " is-over" : ""}`}
                draggable
                onDragStart={(e) => {
                  setDragId(m.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", m.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverId(m.id);
                }}
                onDragLeave={() => setOverId((o) => (o === m.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(m.id);
                  setDragId(null);
                  setOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
              >
                <span className="settings-app__grip" aria-hidden>
                  <Icon name="grip" size={14} />
                </span>
                <Icon name={m.icon} size={16} />
                <span className="settings-list__label">{m.name}</span>
                <span className="settings-app__move">
                  <Button size="sm" variant="ghost" icon="arrow-up" aria-label={`Move ${m.name} up`} disabled={i === 0} onClick={() => move(m.id, -1)} />
                  <Button size="sm" variant="ghost" icon="arrow-down" aria-label={`Move ${m.name} down`} disabled={i === mods.length - 1} onClick={() => move(m.id, 1)} />
                </span>
                {m.id === HOME_ID ? (
                  <span className="cx-label settings-app__always">Always on</span>
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
