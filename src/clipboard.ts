export const RESET_DELAY_MS = 2000;

// Visible recovery for a failed copy. `hint` is a hidden element explaining
// what to do instead; `source` is the element holding the text, which gets
// selected so copying by hand is one keystroke away.
export interface CopyFallback {
  hint?: HTMLElement | null;
  source?: HTMLElement | null;
}

// `label` names what was copied in status messages ("Link copied to clipboard.").
export function createCopyHandler(
  button: HTMLButtonElement,
  text: string,
  status?: HTMLElement | null,
  label = "Link",
  { hint, source }: CopyFallback = {},
): () => Promise<void> {
  const originalHTML = button.innerHTML;
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  return async () => {
    const copied = await copyText(text);

    // Hold the button's width so the shorter status text doesn't shift the layout.
    button.style.minWidth = `${button.offsetWidth}px`;
    button.textContent = copied ? "Copied!" : "Copy failed";
    if (status) {
      status.textContent = copied
        ? `${label} copied to clipboard.`
        : `Couldn't copy automatically. The ${label.toLowerCase()} is: ${text}`;
    }

    // The hint stays up after the button resets: two seconds is too short to
    // read it and act on it. A later successful copy hides it again.
    if (hint) hint.hidden = copied;
    if (!copied && source) selectContents(source);

    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      button.innerHTML = originalHTML;
      button.style.minWidth = "";
      if (status) status.textContent = "";
    }, RESET_DELAY_MS);
  };
}

function selectContents(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.selectAllChildren(element);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return fallbackCopy(text);
  }
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

// Phones get the native share sheet; elsewhere navigator.share either doesn't
// exist or opens a desktop dialog that's clumsier than copying the link.
export function canNativeShare(): boolean {
  return (
    typeof navigator.share === "function" &&
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}

export function createShareHandler(
  url: string,
  fallback: () => Promise<void>,
): () => Promise<void> {
  return async () => {
    if (!canNativeShare()) return fallback();
    try {
      await navigator.share({ title: document.title, url });
    } catch (error) {
      // AbortError means the person closed the share sheet; don't copy behind their back.
      if ((error as DOMException | undefined)?.name !== "AbortError") await fallback();
    }
  };
}

// Buttons with data-share try the native share sheet first.
// Each button announces through the [data-copy-status] region that shares its
// parent, so several copy buttons can live on one page. A [data-copy-hint] and
// [data-copy-source] in the same parent power the visible failure fallback.
export function initClipboard(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-copy-text]").forEach((button) => {
    const text = button.getAttribute("data-copy-text") ?? "";
    const label = button.getAttribute("data-copy-label") ?? undefined;
    const scope = button.parentElement;
    const status = scope?.querySelector<HTMLElement>("[data-copy-status]");
    const copy = createCopyHandler(button, text, status, label, {
      hint: scope?.querySelector<HTMLElement>("[data-copy-hint]"),
      source: scope?.querySelector<HTMLElement>("[data-copy-source]"),
    });
    const handler = button.hasAttribute("data-share") ? createShareHandler(text, copy) : copy;
    button.addEventListener("click", handler);
  });
}
