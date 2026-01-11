import nock from "nock";
// Requiring our app implementation
import myProbotApp from "../index.js";
import { Probot, ProbotOctokit } from "probot";
// Requiring our fixtures
//import checkSuitePayload from "./fixtures/check_suite.requested" with { type: "json" };
//import checkRunSuccess from "./fixtures/check_run.created" with { type: "json" };
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { describe, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert";
import pino from "pino";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const privateKey = fs.readFileSync(
  path.join(__dirname, "fixtures/mock-cert.pem"),
  "utf-8",
);

const checkRunRerequestedPayload = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/check_run.rerequested.json"),
    "utf-8",
  ),
);

const checkRunSuccess = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/check_run.created.json"),
    "utf-8",
  ),
);

const pullRequestGetSuccess = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.get.success.json"),
    "utf-8",
  ),
);

const pullRequestGetFailure = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.get.failure.json"),
    "utf-8",
  ),
);

const pullRequestGetNoRefs = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.get.no_refs.json"),
    "utf-8",
  ),
);

const pullRequestGetLinkedOnly = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.get.linked_only.json"),
    "utf-8",
  ),
);

const pullRequestClosedPayload = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.closed.json"),
    "utf-8",
  ),
);

const pullRequestGetClosed = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.get.closed.json"),
    "utf-8",
  ),
);

const pullRequestOpenedPayload = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.opened.json"),
    "utf-8",
  ),
);

const pullRequestEditedPayload = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.edited.json"),
    "utf-8",
  ),
);

const pullRequestReopenedPayload = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "fixtures/pull_request.reopened.json"),
    "utf-8",
  ),
);

describe("Azure Boards Link Check", () => {
  let probot;
  // Silent logger to suppress Probot's error output during tests
  const silentLogger = pino({ level: "silent" });

  beforeEach(async () => {
    nock.disableNetConnect();
    // Enable pull_request.opened handling for tests
    process.env.PROCESS_PR_OPENED = "true";
    probot = new Probot({
      appId: 123,
      privateKey,
      log: silentLogger,
      // Disable throttling & retrying requests for easier testing
      Octokit: ProbotOctokit.defaults((instanceOptions) => {
        return {
          ...instanceOptions,
          retry: { enabled: false },
          throttle: { enabled: false },
        };
      }),
    });
    // Load our app into probot (async in Probot 14+)
    await probot.load(myProbotApp);
  });

  test("creates a passing check on check_run rerequested", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })

      .get("/repos/thundering-mona/testing-things/pulls/121")
      .reply(200, pullRequestGetSuccess)

      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        body.started_at = "2018-10-05T17:35:21.594Z";
        body.completed_at = "2018-10-05T17:35:53.683Z";
        assert.strictEqual(body.conclusion, "success");
        assert.strictEqual(body.output.title, "1 work item linked and 1 work item unlinked");
        assert.match(
          body.output.summary,
          /\*\*Linked work items \(1\):\*\*[\s\S]*\[AB#123\]\(https:\/\/dev\.azure\.com\/org\/project\/_workitems\/edit\/123\)/,
        );
        assert.match(body.output.summary, /\*\*Unlinked references \(1\):\*\*[\s\S]*AB#456/);
        return true;
      })
      .reply(200);

    // Receive a webhook event
    await probot.receive({ name: "check_run", payload: checkRunRerequestedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("creates a passing check on pull_request opened", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })

      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetSuccess)

      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        body.started_at = "2018-10-05T17:35:21.594Z";
        body.completed_at = "2018-10-05T17:35:53.683Z";
        assert.strictEqual(body.conclusion, "success");
        assert.strictEqual(body.output.title, "1 work item linked and 1 work item unlinked");
        assert.match(
          body.output.summary,
          /\*\*Linked work items \(1\):\*\*[\s\S]*\[AB#123\]\(https:\/\/dev\.azure\.com\/org\/project\/_workitems\/edit\/123\)/,
        );
        assert.match(body.output.summary, /\*\*Unlinked references \(1\):\*\*[\s\S]*AB#456/);
        assert.match(
          body.output.summary,
          /Review the unlinked references\. Unlinked references may mean the \[Boards integration\]\([^)]*\) has not linked them yet, is misconfigured, or the work item number is invalid\./i,
        );
        assert.strictEqual(body.head_branch, checkRunSuccess.head_branch);
        assert.strictEqual(body.head_sha, checkRunSuccess.head_sha);
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("creates a passing check on pull_request edited", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })

      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetFailure)

      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        body.started_at = "2018-10-05T17:35:21.594Z";
        body.completed_at = "2018-10-05T17:35:53.683Z";
        assert.strictEqual(body.conclusion, "failure");
        assert.strictEqual(body.output.title, "0 work items linked and 1 work item unlinked");
        assert.match(
          body.output.summary,
          /\*\*Linked work items \(0\):\*\*[\s\S]*_None_/,
        );
        assert.match(body.output.summary, /\*\*Unlinked references \(1\):\*\*[\s\S]*AB#789/);
        assert.match(
          body.output.summary,
          /No work items linked yet\. Validate the referenced work item numbers or verify the \[Boards integration\]\([^)]*\) is working\. Will revalidate once they are linked\./i,
        );
        assert.strictEqual(body.head_branch, checkRunSuccess.head_branch);
        assert.strictEqual(body.head_sha, checkRunSuccess.head_sha);
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestEditedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("creates a failing check when no work item refs", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })

      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetNoRefs)

      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "failure");
        assert.match(
          body.output.summary,
          /No work item references found\. Add AB#<id> or \[AB#<id>\]\(\.\.\.\)\. If work items are already linked, re-run this check from the Checks tab to refresh\./,
        );
        assert.strictEqual(body.output.title, "No work items found");
        assert.doesNotMatch(
          body.output.summary,
          /No work items linked yet\. Validate the referenced work item numbers or verify the Boards integration is working\. Will revalidate once they are linked\./i,
        );
        assert.doesNotMatch(
          body.output.summary,
          /Review the unlinked references\. Unlinked references may mean the Boards integration has not linked them yet, is misconfigured, or the work item number is invalid\./i,
        );
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("ignores pull_request closed events", async () => {

    const mock = nock("https://api.github.com");

    await probot.receive({ name: "pull_request", payload: pullRequestClosedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("skips validation when pull_request.edited on a closed PR", async () => {
    // PR was edited (e.g., description changed) but PR is already closed
    const closedEditedPayload = {
      ...pullRequestEditedPayload,
      pull_request: {
        ...pullRequestEditedPayload.pull_request,
        state: "closed",
      },
    };

    const mock = nock("https://api.github.com");

    await probot.receive({ name: "pull_request", payload: closedEditedPayload });

    // No API calls should be made - handler exits early for closed PRs
    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("ignores check_run rerequested when PR is closed", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: { checks: "write" },
      })

      .get("/repos/thundering-mona/testing-things/pulls/121")
      .reply(200, pullRequestGetClosed);

    await probot.receive({ name: "check_run", payload: checkRunRerequestedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("creates a passing check on pull_request opened with only linked refs", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })

      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetLinkedOnly)

      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        assert.strictEqual(body.output.title, "1 work item linked");
        assert.match(body.output.summary, /\*\*Linked work items \(1\):\*\*[\s\S]*\[AB#123\]\(https:\/\/dev\.azure\.com\/org\/project\/_workitems\/edit\/123\)/);
        assert.match(body.output.summary, /\*\*Unlinked references \(0\):\*\*[\s\S]*_None_/);
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("uses PR body from payload when ALWAYS_FETCH_PR=false", async () => {
    // Set ALWAYS_FETCH_PR to false - should use payload body instead of API
    process.env.ALWAYS_FETCH_PR = "false";

    // Need to reload probot with new env setting
    probot = new Probot({
      appId: 123,
      privateKey,
      log: silentLogger,
      Octokit: ProbotOctokit.defaults((instanceOptions) => {
        return {
          ...instanceOptions,
          retry: { enabled: false },
          throttle: { enabled: false },
        };
      }),
    });
    await probot.load(myProbotApp);

    // Create payload with body included (simulating webhook payload)
    const payloadWithBody = {
      ...pullRequestOpenedPayload,
      pull_request: {
        ...pullRequestOpenedPayload.pull_request,
        state: "open",
        body: "Implements feature.\n[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)\nAB#456",
      },
    };

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      // NOTE: No GET /pulls/1 call - body comes from payload
      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        assert.strictEqual(body.output.title, "1 work item linked and 1 work item unlinked");
        assert.match(
          body.output.summary,
          /\*\*Linked work items \(1\):\*\*[\s\S]*\[AB#123\]\(https:\/\/dev\.azure\.com\/org\/project\/_workitems\/edit\/123\)/,
        );
        assert.match(body.output.summary, /\*\*Unlinked references \(1\):\*\*[\s\S]*AB#456/);
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: payloadWithBody });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("fetches PR from API when ALWAYS_FETCH_PR is not set (default)", async () => {
    // Ensure ALWAYS_FETCH_PR is not set (default behavior)
    delete process.env.ALWAYS_FETCH_PR;

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      // Default behavior: should fetch from API even if body is in payload
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetSuccess)

      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("skips check in handlePullRequest when API returns closed PR", async () => {
    // Payload says PR is open, but API returns closed (race condition)
    // This tests the result?.skipped check in handlePullRequest
    const openPayload = {
      ...pullRequestEditedPayload,
      pull_request: {
        ...pullRequestEditedPayload.pull_request,
        state: "open",
      },
    };

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      // API returns closed PR
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetClosed);

    await probot.receive({ name: "pull_request", payload: openPayload });

    // No check-runs call should be made - skipped due to closed PR from API
    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("fails check when unlinked refs exist and PASS_REQUIRES_ALL_LINKED_WORKITEMS=true", async () => {
    process.env.PASS_REQUIRES_ALL_LINKED_WORKITEMS = "true";

    // Need to reload probot with new env setting
    probot = new Probot({
      appId: 123,
      privateKey,
      log: silentLogger,
      Octokit: ProbotOctokit.defaults((instanceOptions) => {
        return {
          ...instanceOptions,
          retry: { enabled: false },
          throttle: { enabled: false },
        };
      }),
    });
    await probot.load(myProbotApp);

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      // PR has 1 linked and 1 unlinked - should fail when requiring all linked
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetSuccess)

      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "failure");
        assert.strictEqual(body.output.title, "1 work item linked and 1 work item unlinked");
        assert.match(
          body.output.summary,
          /\*\*All work items must be linked\.\*\*/,
        );
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("passes check when all refs are linked and PASS_REQUIRES_ALL_LINKED_WORKITEMS=true", async () => {
    process.env.PASS_REQUIRES_ALL_LINKED_WORKITEMS = "true";

    // Need to reload probot with new env setting
    probot = new Probot({
      appId: 123,
      privateKey,
      log: silentLogger,
      Octokit: ProbotOctokit.defaults((instanceOptions) => {
        return {
          ...instanceOptions,
          retry: { enabled: false },
          throttle: { enabled: false },
        };
      }),
    });
    await probot.load(myProbotApp);

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      // PR has only linked refs - should pass
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetLinkedOnly)

      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        assert.strictEqual(body.output.title, "1 work item linked");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("ignores pull_request events triggered by Copilot when IGNORE_COPILOT=true (default)", async () => {
    // Create payload with sender.login === 'copilot'
    const copilotPayload = {
      ...pullRequestOpenedPayload,
      sender: { login: "copilot" },
    };

    const mock = nock("https://api.github.com");
    // No API calls should be made - event is ignored

    await probot.receive({ name: "pull_request", payload: copilotPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("ignores check_run events triggered by Copilot when IGNORE_COPILOT=true (default)", async () => {
    // Create payload with sender.login === 'copilot'
    const copilotPayload = {
      ...checkRunRerequestedPayload,
      sender: { login: "copilot" },
    };

    const mock = nock("https://api.github.com");
    // No API calls should be made - event is ignored

    await probot.receive({ name: "check_run", payload: copilotPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("processes pull_request events triggered by Copilot when IGNORE_COPILOT=false", async () => {
    process.env.IGNORE_COPILOT = "false";

    // Need to reload probot with new env setting
    probot = new Probot({
      appId: 123,
      privateKey,
      log: silentLogger,
      Octokit: ProbotOctokit.defaults((instanceOptions) => {
        return {
          ...instanceOptions,
          retry: { enabled: false },
          throttle: { enabled: false },
        };
      }),
    });
    await probot.load(myProbotApp);

    // Create payload with sender.login === 'copilot'
    const copilotPayload = {
      ...pullRequestOpenedPayload,
      sender: { login: "copilot" },
    };

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetSuccess)
      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: copilotPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("always processes pull_request.synchronize from Copilot even when IGNORE_COPILOT=true", async () => {
    // IGNORE_COPILOT defaults to true, but synchronize should always be processed
    // Create a synchronize payload with sender.login === 'copilot'
    const copilotSyncPayload = {
      ...pullRequestOpenedPayload,
      action: "synchronize",
      sender: { login: "copilot" },
    };

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetSuccess)
      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: copilotSyncPayload });

    // All mocks should be consumed - synchronize is processed
    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("creates a passing check on pull_request reopened", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetSuccess)
      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        assert.strictEqual(body.output.title, "1 work item linked and 1 work item unlinked");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestReopenedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("ignores pull_request.opened when PROCESS_PR_OPENED=false (default)", async () => {
    // Set PROCESS_PR_OPENED to false (default behavior)
    process.env.PROCESS_PR_OPENED = "false";

    // Need to reload probot with new env setting
    probot = new Probot({
      appId: 123,
      privateKey,
      log: silentLogger,
      Octokit: ProbotOctokit.defaults((instanceOptions) => {
        return {
          ...instanceOptions,
          retry: { enabled: false },
          throttle: { enabled: false },
        };
      }),
    });
    await probot.load(myProbotApp);

    const mock = nock("https://api.github.com");
    // No API calls should be made - opened events are ignored

    await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("still processes pull_request.edited when PROCESS_PR_OPENED=false", async () => {
    // Set PROCESS_PR_OPENED to false
    process.env.PROCESS_PR_OPENED = "false";

    // Need to reload probot with new env setting
    probot = new Probot({
      appId: 123,
      privateKey,
      log: silentLogger,
      Octokit: ProbotOctokit.defaults((instanceOptions) => {
        return {
          ...instanceOptions,
          retry: { enabled: false },
          throttle: { enabled: false },
        };
      }),
    });
    await probot.load(myProbotApp);

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetSuccess)
      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "pull_request", payload: pullRequestEditedPayload });

    // All mocks should be consumed - edited is still processed
    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("handles missing pull_number in check_run gracefully", async () => {
    // Create a check_run payload without pull_requests
    const checkRunNoPR = {
      ...checkRunRerequestedPayload,
      check_run: {
        ...checkRunRerequestedPayload.check_run,
        pull_requests: [],
      },
    };

    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      // No GET /pulls call - there's no PR number
      // Should still create a check run with default values
      .post("/repos/thundering-mona/testing-things/check-runs", (body) => {
        assert.strictEqual(body.conclusion, "success");
        assert.strictEqual(body.output.title, "Work item validation");
        assert.strictEqual(body.output.summary, "The check has passed!");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "check_run", payload: checkRunNoPR });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("handles API error when fetching PR", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(404, { message: "Not Found" });

    // Should throw/reject when API returns error
    await assert.rejects(
      async () => {
        await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });
      },
      (err) => {
        // Probot wraps errors, check it's related to the 404
        return err.message.includes("Not Found") || err.status === 404 || err.message.includes("404");
      },
    );

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("handles API error when creating check run", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "write",
        },
      })
      .get("/repos/thundering-mona/testing-things/pulls/1")
      .reply(200, pullRequestGetSuccess)
      .post("/repos/thundering-mona/testing-things/check-runs")
      .reply(403, { message: "Resource not accessible by integration" });

    await assert.rejects(
      async () => {
        await probot.receive({ name: "pull_request", payload: pullRequestOpenedPayload });
      },
      (err) => {
        return err.message.includes("Resource not accessible") || err.status === 403 || err.message.includes("403");
      },
    );

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    delete process.env.PROCESS_PR_OPENED;
    delete process.env.ALWAYS_FETCH_PR;
    delete process.env.PASS_REQUIRES_ALL_LINKED_WORKITEMS;
    delete process.env.IGNORE_COPILOT;
  });
});

// For more information about testing with the Node.js test runner see:
// https://nodejs.org/api/test.html

// For more information about testing with Nock see:
// https://github.com/nock/nock
