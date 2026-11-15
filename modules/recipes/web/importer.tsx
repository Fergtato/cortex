import { useState } from "react";
import { AiUnavailable, useAiStatus, useRouter } from "@cortex/core";
import { Button, Input } from "@cortex/ui";
import { Modal } from "./components";
import { BASE, setPendingDraft, useAiRecipe, useImportRecipe } from "./data";

/*
 * Two ways to start a recipe without typing it all: import from a link, or
 * describe an idea to the person's AI. Both open the editor with a draft.
 */

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
        navigate(`${BASE}/new?import=${Date.now()}`);
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

const IDEAS = [
  "Something quick and vegetarian with leeks, feta and eggs",
  "A cosy one-pot chicken dinner for a rainy night",
  "High-protein lunch I can meal prep for the week",
  "Impressive but easy dessert for a dinner party",
];

/** Describe a dish; the person's AI writes the recipe and the editor opens with it. */
export function AiRecipeDialog({ onClose }: { onClose: () => void }) {
  const { navigate } = useRouter();
  const status = useAiStatus();
  const [idea, setIdea] = useState("");
  const [servings, setServings] = useState("");
  const gen = useAiRecipe();
  const go = () => {
    if (idea.trim().length < 3 || gen.isPending) return;
    gen.mutate(
      { idea: idea.trim(), servings: Number(servings) || null },
      {
        onSuccess: (draft) => {
          setPendingDraft(draft, "ai");
          onClose();
          navigate(`${BASE}/new?ai=${Date.now()}`);
        },
      },
    );
  };
  const ready = status.data?.available;
  return (
    <Modal
      title="Create a recipe with AI"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="sparkle" disabled={!ready || idea.trim().length < 3 || gen.isPending} onClick={go}>
            {gen.isPending ? "Writing…" : "Write it"}
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
        {status.isSuccess && !ready && <AiUnavailable />}
        <textarea
          autoFocus
          className="rc-in rc-ta"
          rows={4}
          value={idea}
          placeholder="What do you fancy? Ingredients you have, a cuisine, how long you've got…"
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
          }}
          aria-label="Recipe idea"
          disabled={gen.isPending}
        />
        <div className="rc-ideas">
          {IDEAS.map((t) => (
            <button key={t} type="button" className="rc-tag rc-tag--toggle rc-idea" onClick={() => setIdea(t)} disabled={gen.isPending}>
              {t}
            </button>
          ))}
        </div>
        <label className="rc-inline">
          <span className="rc-muted rc-small">Servings</span>
          <input className="rc-in rc-in--min" type="number" min={1} max={50} value={servings} placeholder="auto" onChange={(e) => setServings(e.target.value)} />
        </label>
        {gen.isError ? (
          <p className="rc-error" role="alert">
            {gen.error instanceof Error ? gen.error.message : "The AI couldn't write that recipe."}
          </p>
        ) : (
          <p className="rc-hint">
            {gen.isPending
              ? `Asking ${status.data?.connection?.name ?? "your AI"}… this can take a little while, especially on local models.`
              : `Uses ${status.data?.connection ? `${status.data.connection.name} (${status.data.connection.model})` : "your AI"}. You'll check the recipe in the editor before it's saved.`}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Topbar button + its dialog; hidden when no AI is connected. */
export function AiRecipeButton({ label = "Create with AI" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const status = useAiStatus();
  if (!status.data?.available) return null;
  return (
    <>
      <Button size="sm" variant="ghost" icon="sparkle" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <AiRecipeDialog onClose={() => setOpen(false)} />}
    </>
  );
}
