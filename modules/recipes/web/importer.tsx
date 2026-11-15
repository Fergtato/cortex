import { useState } from "react";
import { useRouter } from "@cortex/core";
import { Button, Input } from "@cortex/ui";
import { Modal } from "./components";
import { BASE, setPendingDraft, useImportRecipe } from "./data";

/** Paste a recipe link; the server reads it and the editor opens with the result to check before saving. */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { navigate } = useRouter();
  const [url, setUrl] = useState("");
  const imp = useImportRecipe();
  const go = () => {
    if (!url.trim() || imp.isPending) return;
    imp.mutate(url.trim(), {
      onSuccess: (draft) => {
        setPendingDraft(draft);
        onClose();
        navigate(`${BASE}/new?import=1`);
      },
    });
  };
  return (
    <Modal
      title="Import a recipe from a link"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!url.trim() || imp.isPending} onClick={go}>
            {imp.isPending ? "Reading the page…" : "Import"}
          </Button>
        </>
      }
    >
      <form
        className="rc-import"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <Input autoFocus icon="link" placeholder="https://www.bbcgoodfood.com/recipes/…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Recipe link" />
        {imp.isError ? (
          <p className="rc-error" role="alert">
            {imp.error instanceof Error ? imp.error.message : "Couldn't import that link."}
          </p>
        ) : (
          <p className="rc-hint">Works with most recipe sites. You'll see the recipe in the editor to check before it's saved: steps with times are guessed from the text, so the timeline may need a tweak.</p>
        )}
      </form>
    </Modal>
  );
}

/** Topbar button + its dialog. */
export function ImportButton({ label = "Import" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon="link" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <ImportDialog onClose={() => setOpen(false)} />}
    </>
  );
}
