interface MilkdownListItemLabel {
  readonly label: string;
  readonly listType: string;
  readonly checked?: boolean | null;
}

export function renderMilkdownListItemLabel({ label, listType, checked }: MilkdownListItemLabel): string {
  if (checked !== undefined && checked !== null) {
    return '<span class="jot-task-checkbox" aria-hidden="true"></span>';
  }

  if (listType === "bullet") {
    return '<span class="jot-list-marker" aria-hidden="true">&bull;</span>';
  }

  return `<span class="jot-list-marker">${escapeHtml(label)}</span>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
