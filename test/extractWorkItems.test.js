import { describe, test } from "node:test";
import assert from "node:assert";
import { extractWorkItems, LINKED_WI_REGEX, UNLINKED_WI_REGEX } from "../helpers/extractWorkItems.js";

describe("extractWorkItems", () => {
  test("extracts linked work items with URLs", () => {
    const body = "Implements feature.\n[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, ["[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)"]);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("treats invalid URL format as unlinked", () => {
    const body = "[AB#123](https://example.com/invalid)";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, ["AB#123"]);
  });

  test("extracts unlinked work items", () => {
    const body = "Fixes AB#456 and AB#789";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, ["AB#456", "AB#789"]);
  });

  test("extracts both linked and unlinked work items", () => {
    const body = "Implements feature.\n[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)\nAB#456";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, ["[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)"]);
    assert.deepStrictEqual(result.unlinked, ["AB#456"]);
  });

  test("returns empty arrays when no work items found", () => {
    const body = "Just a regular PR description with no work items";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("handles empty body", () => {
    const body = "";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("deduplicates linked work items", () => {
    const body = "[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)\n[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, ["[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)"]);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("deduplicates unlinked work items", () => {
    const body = "AB#456 and AB#456 again";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, ["AB#456"]);
  });

  test("does not count linked ID as unlinked", () => {
    // When AB#123 appears both linked and as plain text, only count as linked
    const body = "[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)\nAlso references AB#123";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, ["[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)"]);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("handles multiple linked work items", () => {
    const body = "[AB#100](https://dev.azure.com/org/project/_workitems/edit/100)\n[AB#200](https://mona.visualstudio.com/5b713c7f-13e3-42ca-bb7c-dd8fd0f46445/_workitems/edit/1671)\n[AB#300](https://dev.azure.com/org/project/_workitems/edit/300)";
    const result = extractWorkItems(body);

    assert.strictEqual(result.linked.length, 3);
    assert.ok(result.linked.includes("[AB#100](https://dev.azure.com/org/project/_workitems/edit/100)"));
    assert.ok(result.linked.includes("[AB#200](https://mona.visualstudio.com/5b713c7f-13e3-42ca-bb7c-dd8fd0f46445/_workitems/edit/1671)"));
    assert.ok(result.linked.includes("[AB#300](https://dev.azure.com/org/project/_workitems/edit/300)"));
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("handles work items in complex markdown", () => {
    const body = `## Description
This PR fixes a bug.

## Related Work Items
- [AB#123](https://dev.azure.com/org/project/_workitems/edit/123)
- AB#456

## Notes
See AB#789 for more context.`;
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, ["[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)"]);
    assert.deepStrictEqual(result.unlinked, ["AB#456", "AB#789"]);
  });

  test("is case insensitive for AB prefix", () => {
    const body = "ab#123 and AB#456 and Ab#789";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.unlinked, ["AB#123", "AB#456", "AB#789"]);
  });

  test("is case insensitive for linked AB prefix", () => {
    const body = "[ab#123](https://dev.azure.com/org/project/_workitems/edit/123) and [Ab#456](https://dev.azure.com/org/project/_workitems/edit/456)";
    const result = extractWorkItems(body);

    assert.strictEqual(result.linked.length, 2);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("handles HTTP URLs (non-HTTPS)", () => {
    const body = "[AB#123](http://dev.azure.com/org/project/_workitems/edit/123)";
    const result = extractWorkItems(body);

    assert.deepStrictEqual(result.linked, ["[AB#123](http://dev.azure.com/org/project/_workitems/edit/123)"]);
    assert.deepStrictEqual(result.unlinked, []);
  });
});

describe("LINKED_WI_REGEX", () => {
  test("matches linked work item format with valid Azure DevOps URL", () => {
    const text = "[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)";
    const matches = [...text.matchAll(LINKED_WI_REGEX)];

    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0][1], "123");
    assert.strictEqual(matches[0][2], "https://dev.azure.com/org/project/_workitems/edit/123");
  });

  test("matches multiple linked work items with valid URLs", () => {
    const text = "[AB#123](https://dev.azure.com/org1/proj1/_workitems/edit/123) and [AB#456](https://dev.azure.com/org2/proj2/_workitems/edit/456)";
    const matches = [...text.matchAll(LINKED_WI_REGEX)];

    assert.strictEqual(matches.length, 2);
  });

  test("matches with custom host", () => {
    const text = "[AB#789](https://mycompany.visualstudio.com/myorg/myproject/_workitems/edit/789)";
    const matches = [...text.matchAll(LINKED_WI_REGEX)];

    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0][1], "789");
  });

  test("matches with project as GUID (visualstudio.com format)", () => {
    const text = "[AB#1671](https://mona.visualstudio.com/5b713c7f-13e3-42ca-bb7c-dd8fd0f46445/_workitems/edit/1671)";
    const matches = [...text.matchAll(LINKED_WI_REGEX)];

    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0][1], "1671");
    assert.strictEqual(matches[0][2], "https://mona.visualstudio.com/5b713c7f-13e3-42ca-bb7c-dd8fd0f46445/_workitems/edit/1671");
  });

  test("does not match invalid URL format", () => {
    const text = "[AB#123](https://example.com/invalid/url)";
    const matches = [...text.matchAll(LINKED_WI_REGEX)];

    assert.strictEqual(matches.length, 0);
  });

  test("does not match URL missing _workitems/edit path", () => {
    const text = "[AB#123](https://dev.azure.com/org/project/123)";
    const matches = [...text.matchAll(LINKED_WI_REGEX)];

    assert.strictEqual(matches.length, 0);
  });
});

describe("UNLINKED_WI_REGEX", () => {
  test("matches unlinked work item format", () => {
    const text = "AB#123";
    const matches = [...text.matchAll(UNLINKED_WI_REGEX)];

    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0][1], "123");
  });

  test("matches multiple unlinked work items", () => {
    const text = "AB#123 and AB#456";
    const matches = [...text.matchAll(UNLINKED_WI_REGEX)];

    assert.strictEqual(matches.length, 2);
  });
});
