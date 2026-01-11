# Copilot Instructions for pr-workitem-checker-app

## Project Overview

This is a **Probot GitHub App** that validates pull requests contain Azure Boards work item references (`AB#123`). It creates GitHub Check Runs to enforce traceability between code changes and work items.

## Architecture

```
index.js                     # Entry point: event handlers for PR and check_run events
helpers/
  ├── extractWorkItems.js    # Regex-based parsing of AB#ID references (linked vs unlinked)
  └── validatePullRequest.js # Core validation logic, builds check run conclusion/summary
```

**Data flow**: Webhook event → `index.js` handler → `validatePullRequest()` → `extractWorkItems()` → Check Run creation via GitHub API

## Key Patterns

### Work Item Detection (extractWorkItems.js)
- **Linked**: `[AB#123](https://dev.azure.com/org/project/_workitems/edit/123)` - counts toward success
- **Unlinked**: `AB#123` - warning only (unless `PASS_REQUIRES_ALL_LINKED_WORKITEMS=true`)
- Uses regex matching with `LINKED_WI_REGEX` and `UNLINKED_WI_REGEX` constants

### Event Handling (index.js)
- Handlers: `handleCheckSuite` (check_run.rerequested) and `handlePullRequest` (PR events)
- Environment-driven behavior via `PROCESS_PR_OPENED`, `ALWAYS_FETCH_PR`, `IGNORE_COPILOT`
- Skip closed PRs early - check `prState !== "open"` before validation
- Use `context.repo()` helper to add owner/repo to API payloads

### Probot Conventions
- Export default function receiving `app` parameter
- Use `context.octokit` for GitHub API calls (Octokit instance)
- Structured logging: `context.log.info({ key: value }, "message")`
- Access payload via `context.payload`

## Development Commands

```bash
npm install        # Install dependencies
npm test           # Run tests (Node.js built-in test runner)
npm run lint       # Syntax check (--check flag, not a full linter)
npm start          # Start app (probot run ./index.js)
```

## Testing Patterns

Tests use **Node.js built-in test runner** with `nock` for HTTP mocking:

```javascript
import { describe, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert";
import nock from "nock";
```

**Test structure** (see `test/index.test.js`):
1. Mock `/app/installations/{id}/access_tokens` for auth
2. Mock `GET /repos/{owner}/{repo}/pulls/{number}` for PR data
3. Mock `POST /repos/{owner}/{repo}/check-runs` with assertion callback
4. Call `probot.receive({ name: "event_name", payload: fixture })`
5. Verify `mock.pendingMocks()` is empty

**Fixtures location**: `test/fixtures/` - JSON files for webhook payloads and API responses

## Code Style

- ES Modules (`"type": "module"` in package.json) - use `import/export`
- JSDoc for function documentation with TypeScript-style type hints
- Pure functions in helpers; side effects (API calls) in index.js handlers
- Environment variables read at handler setup time, not inside functions

## Common Tasks

**Adding a new environment variable:**
1. Read in `index.js` at module level or in handler setup
2. Pass needed values to `validatePullRequest()` if affecting validation logic
3. Document in README.md environment variables table

**Modifying check run output:**
- Update `buildSummary()` and `buildTitle()` in `helpers/validatePullRequest.js`
- Update `buildCheckRunPayload()` in `index.js` for structural changes

**Adding a new webhook event:**
1. Add to `prEvents` array or use `app.on()` in `index.js`
2. Update `app.yml` if new event type needed
3. Create fixture in `test/fixtures/` and add test case
