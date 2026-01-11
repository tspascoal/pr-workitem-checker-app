// Matches [AB#123](https://{host}/{org}/{project}/_workitems/edit/123) or [AB#123](https://{host}/{project}/_workitems/edit/123)
// Project can be a name or GUID
const LINKED_WI_REGEX = /\[AB#(\d+)\]\((https?:\/\/[^/]+(?:\/[^/]+)+\/_workitems\/edit\/(\d+))\)/gi;
const UNLINKED_WI_REGEX = /AB#(\d+)/gi;

/**
 * Extracts work item references from a PR body.
 * Identifies both linked (with URLs) and unlinked (bare AB#123) references.
 * @param {string} body - The PR body text to parse
 * @returns {{ linked: string[], unlinked: string[] }} - Arrays of linked and unlinked work item references
 */
export function extractWorkItems(body) {
  const linked = [];
  const linkedIds = new Set();
  const unlinked = [];

  // Collect linked references
  for (const match of body.matchAll(LINKED_WI_REGEX)) {
    const [, id, url] = match;
    linkedIds.add(id);
    linked.push(`[AB#${id}](${url})`);
  }

  // Remove linked references before searching unlinked to avoid double counting
  const bodyWithoutLinked = body.replace(LINKED_WI_REGEX, "");
  for (const match of bodyWithoutLinked.matchAll(UNLINKED_WI_REGEX)) {
    const [, id] = match;
    if (!linkedIds.has(id)) {
      unlinked.push(`AB#${id}`);
    }
  }

  return { linked: unique(linked), unlinked: unique(unlinked) };
}

function unique(arr) {
  return [...new Set(arr)];
}

export { LINKED_WI_REGEX, UNLINKED_WI_REGEX };
