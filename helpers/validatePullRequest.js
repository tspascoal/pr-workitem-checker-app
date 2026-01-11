import { extractWorkItems, LINKED_WI_REGEX, UNLINKED_WI_REGEX } from "./extractWorkItems.js";

/**
 * Fetches PR and validates body for work item reference (Azure Boards: AB#123).
 * @param {object} params
 * @param {import('@octokit/rest').Octokit} params.octokit
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {number} params.pull_number
 * @param {string} [params.body] - Optional PR body (if provided, skips API fetch)
 * @param {string} [params.prState] - Optional PR state (required if body is provided)
 * @returns {Promise<{ conclusion: 'success' | 'failure' | 'neutral', summary: string, title: string, linked: string[], unlinked: string[], prState?: string, skipped?: boolean }>}
 */
export async function validatePullRequest({ octokit, owner, repo, pull_number, body: providedBody, prState: providedPrState }) {
  let body;
  let prState;

  if (providedBody !== undefined) {
    // Use provided body from webhook payload
    body = providedBody || "";
    prState = providedPrState;
  } else {
    // Fetch PR from API
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number });
    body = pr.body || "";
    prState = pr.state;
  }

  if (prState && prState !== "open") {
    return {
      skipped: true,
      prState,
      conclusion: "neutral",
      summary: "PR is closed; skipping validation.",
      title: "No work items found",
      linked: [],
      unlinked: [],
    };
  }

  const { linked, unlinked } = extractWorkItems(body);
  const hasLinked = linked.length > 0;
  const hasUnlinked = unlinked.length > 0;
  const requireAllLinked = process.env.PASS_REQUIRES_ALL_LINKED_WORKITEMS === "true";

  const conclusion = determineConclusion({ hasLinked, hasUnlinked, requireAllLinked });
  const summary = buildSummary({ linked, unlinked, requireAllLinked });
  const title = buildTitle({ linked, unlinked });

  return { conclusion, summary, title, linked, unlinked, prState };
}

/**
 * Determines the check conclusion based on work item linkage status.
 * @param {object} params
 * @param {boolean} params.hasLinked - Whether any linked work items exist
 * @param {boolean} params.hasUnlinked - Whether any unlinked work items exist
 * @param {boolean} params.requireAllLinked - Whether all work items must be linked
 * @returns {'success' | 'failure'}
 */
function determineConclusion({ hasLinked, hasUnlinked, requireAllLinked }) {
  // Must have at least one linked work item
  if (!hasLinked) {
    return "failure";
  }

  // If requiring all linked, fail when unlinked refs exist
  if (requireAllLinked && hasUnlinked) {
    return "failure";
  }

  return "success";
}

function buildSummary({ linked, unlinked, requireAllLinked = false }) {
  if (linked.length === 0 && unlinked.length === 0) {
    return "No work item references found. Add AB#<id> or [AB#<id>](...). If work items are already linked, re-run this check from the Checks tab to refresh.";
  }

  const parts = [];
  parts.push(`**Linked work items (${linked.length}):**`);
  parts.push(linked.length ? linked.map((id) => `- ${id}`).join("\n") : "- _None_");

  parts.push("");
  parts.push(`**Unlinked references (${unlinked.length}):**`);
  parts.push(unlinked.length ? unlinked.map((id) => `- ${id}`).join("\n") : "- _None_");

  if (linked.length === 0 && unlinked.length > 0) {
    parts.push("");
    parts.push(
      "No work items linked yet. Validate the referenced work item numbers or verify the [Boards integration](https://learn.microsoft.com/en-us/azure/devops/boards/github/?view=azure-devops) is working. Will revalidate once they are linked.",
    );
  } else if (unlinked.length > 0) {
    parts.push("");
    if (requireAllLinked) {
      parts.push(
        "**All work items must be linked.** Unlinked references may mean the [Boards integration](https://learn.microsoft.com/en-us/azure/devops/boards/github/?view=azure-devops) has not linked them yet, is misconfigured, or the work item number is invalid.",
      );
    } else {
      parts.push(
        "Review the unlinked references. Unlinked references may mean the [Boards integration](https://learn.microsoft.com/en-us/azure/devops/boards/github/?view=azure-devops) has not linked them yet, is misconfigured, or the work item number is invalid.",
      );
    }
  }

  return parts.join("\n");
}

function buildTitle({ linked, unlinked }) {
  const linkedCount = linked.length;
  const unlinkedCount = unlinked.length;
  if (linkedCount === 0 && unlinkedCount === 0) return "No work items found";
  if (unlinkedCount > 0)
    return `${linkedCount} ${pluralize(linkedCount, "work item", "work items")} linked and ${unlinkedCount} ${pluralize(unlinkedCount, "work item", "work items")} unlinked`;
  return `${linkedCount} ${pluralize(linkedCount, "work item", "work items")} linked`;
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

export { LINKED_WI_REGEX, UNLINKED_WI_REGEX };
