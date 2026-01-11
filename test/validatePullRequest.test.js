import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { validatePullRequest } from "../helpers/validatePullRequest.js";

describe("validatePullRequest", () => {
  beforeEach(() => {
    delete process.env.PASS_REQUIRES_ALL_LINKED_WORKITEMS;
  });

  afterEach(() => {
    delete process.env.PASS_REQUIRES_ALL_LINKED_WORKITEMS;
  });

  test("returns skipped=true with neutral conclusion for closed PR", async () => {
    const result = await validatePullRequest({
      octokit: null,
      owner: "test",
      repo: "repo",
      pull_number: 1,
      body: "[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)",
      prState: "closed",
    });

    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.conclusion, "neutral");
    assert.strictEqual(result.prState, "closed");
    assert.strictEqual(result.summary, "PR is closed; skipping validation.");
    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("returns skipped=true for merged PR state", async () => {
    const result = await validatePullRequest({
      octokit: null,
      owner: "test",
      repo: "repo",
      pull_number: 1,
      body: "[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)",
      prState: "merged",
    });

    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.conclusion, "neutral");
  });

  test("returns success for open PR with linked work items", async () => {
    const result = await validatePullRequest({
      octokit: null,
      owner: "test",
      repo: "repo",
      pull_number: 1,
      body: "[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)",
      prState: "open",
    });

    assert.strictEqual(result.skipped, undefined);
    assert.strictEqual(result.conclusion, "success");
    assert.strictEqual(result.prState, "open");
    assert.deepStrictEqual(result.linked, ["[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)"]);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("returns failure for open PR with no work items", async () => {
    const result = await validatePullRequest({
      octokit: null,
      owner: "test",
      repo: "repo",
      pull_number: 1,
      body: "Just a PR with no work items",
      prState: "open",
    });

    assert.strictEqual(result.conclusion, "failure");
    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, []);
  });

  test("returns failure for open PR with only unlinked work items", async () => {
    const result = await validatePullRequest({
      octokit: null,
      owner: "test",
      repo: "repo",
      pull_number: 1,
      body: "Fixes AB#123",
      prState: "open",
    });

    assert.strictEqual(result.conclusion, "failure");
    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, ["AB#123"]);
  });

  test("returns success for open PR with linked and unlinked when PASS_REQUIRES_ALL_LINKED_WORKITEMS is false", async () => {
    const result = await validatePullRequest({
      octokit: null,
      owner: "test",
      repo: "repo",
      pull_number: 1,
      body: "[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)\nAB#456",
      prState: "open",
    });

    assert.strictEqual(result.conclusion, "success");
    assert.strictEqual(result.linked.length, 1);
    assert.strictEqual(result.unlinked.length, 1);
  });

  test("returns failure for open PR with linked and unlinked when PASS_REQUIRES_ALL_LINKED_WORKITEMS is true", async () => {
    process.env.PASS_REQUIRES_ALL_LINKED_WORKITEMS = "true";

    const result = await validatePullRequest({
      octokit: null,
      owner: "test",
      repo: "repo",
      pull_number: 1,
      body: "[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)\nAB#456",
      prState: "open",
    });

    assert.strictEqual(result.conclusion, "failure");
    assert.match(result.summary, /\*\*All work items must be linked\.\*\*/);
  });

  test("fetches PR from API when body is not provided", async () => {
    const mockOctokit = {
      rest: {
        pulls: {
          get: async () => ({
            data: {
              body: "[AB#999](https://dev.azure.com/org/project/_workitems/edit/999)",
              state: "open",
            },
          }),
        },
      },
    };

    const result = await validatePullRequest({
      octokit: mockOctokit,
      owner: "test",
      repo: "repo",
      pull_number: 1,
    });

    assert.strictEqual(result.conclusion, "success");
    assert.deepStrictEqual(result.linked, ["[AB#999](https://dev.azure.com/org/project/_workitems/edit/999)"]);
  });

  test("handles empty body", async () => {
    const result = await validatePullRequest({
      octokit: null,
      owner: "test",
      repo: "repo",
      pull_number: 1,
      body: "",
      prState: "open",
    });

    assert.strictEqual(result.conclusion, "failure");
    assert.match(result.summary, /No work item references found/);
  });

  test("handles null body gracefully", async () => {
    const mockOctokit = {
      rest: {
        pulls: {
          get: async () => ({
            data: {
              body: null,
              state: "open",
            },
          }),
        },
      },
    };

    const result = await validatePullRequest({
      octokit: mockOctokit,
      owner: "test",
      repo: "repo",
      pull_number: 1,
    });

    assert.strictEqual(result.conclusion, "failure");
    assert.deepStrictEqual(result.linked, []);
    assert.deepStrictEqual(result.unlinked, []);
  });
});
