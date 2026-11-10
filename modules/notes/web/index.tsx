import { PageFrame, type CortexModule, type ModuleViewProps } from "@cortex/core";
import { Grid, Panel, Sidebar } from "@cortex/ui";

/*
 * Notes: pages and databases, ported from Cortex v0 (legacy/src) in Phase 2.
 * This placeholder only proves the module contract end to end.
 */

function NotesSidebar(_: ModuleViewProps) {
  return (
    <Sidebar
      title="Notes"
      sections={[
        { items: [{ id: "all", label: "All pages", icon: "note" }] },
        { label: "Databases", items: [] },
      ]}
      active="all"
    />
  );
}

function NotesPage(_: ModuleViewProps) {
  return (
    <PageFrame crumbs={["Notes", "All pages"]} title="Notes" subtitle="Pages and databases from Cortex v0 move here next.">
      <Grid>
        <Panel span={12} tone="sunken">
          <p className="cx-label">No pages yet</p>
        </Panel>
      </Grid>
    </PageFrame>
  );
}

export const notesModule: CortexModule = {
  id: "notes",
  name: "Notes",
  icon: "note",
  Sidebar: NotesSidebar,
  Page: NotesPage,
};
