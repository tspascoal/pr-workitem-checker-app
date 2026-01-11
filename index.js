import { validatePullRequest } from "./helpers/validatePullRequest.js";


const CHECK_NAME = "Azure Boards Link Check";

/**
 * Entry point
 * @param {import('probot').Probot} app
 */
export default (app) => {
  const processPrOpened = process.env.PROCESS_PR_OPENED === "true";
  const alwaysFetchPr = process.env.ALWAYS_FETCH_PR !== "false";
  const ignoreCopilot = process.env.IGNORE_COPILOT !== "false";

  const prEvents = [
    ...(processPrOpened ? ["pull_request.opened"] : []),
    "pull_request.edited",
    "pull_request.reopened",
    "pull_request.synchronize",
  ];

  app.on(["check_run.rerequested"], handleCheckSuite);
  app.on(prEvents, handlePullRequest);

  function buildCheckRunPayload({
    headBranch,
    headSha,
    conclusion = "success",
    summary = "The check has passed!",
    title = "Work item validation",
    startTime = new Date(),
  }) {
    return {
      name: CHECK_NAME,
      head_branch: headBranch,
      head_sha: headSha,
      status: "completed",
      started_at: startTime instanceof Date ? startTime.toISOString() : startTime,
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title,
        summary,
      },
    };
  }

  async function handleCheckSuite(context) {
    const payload = context.payload;

    // Skip events triggered by Copilot
    if (ignoreCopilot && payload.sender?.login === "copilot") {
      context.log.info("Ignoring check_run event triggered by Copilot");
      return;
    }

    const checkSuite = payload.check_suite;
    const checkRun = payload.check_run;

    const headBranch = checkSuite?.head_branch ?? checkRun?.head_branch;
    const headSha = checkSuite?.head_sha ?? checkRun?.head_sha;

    const pull_number =
      checkSuite?.pull_requests?.[0]?.number ?? checkRun?.pull_requests?.[0]?.number;

    const owner = payload.repository?.owner?.login;
    const repo = payload.repository?.name;

    let conclusion = "success";
    let summary = "The check has passed!";
    let title = "Work item validation";

    context.log.info(
      { pull_number, owner, repo },
      "Handling check run request",
    );

    if (pull_number && owner && repo) {
      const result = await validatePullRequest({
        octokit: context.octokit,
        owner,
        repo,
        pull_number,
      });

      if (result?.skipped) {
        context.log.info(
          { pull_number, prState: result.prState },
          "Skipping check run in handleCheckSuite",
        );
        return;
      }
      conclusion = result.conclusion;
      summary = result.summary;
      title = result.title ?? title;
    }

    context.log.info(
      { pull_number, conclusion, headBranch, headSha },
      "Creating check run in handleCheckSuite",
    );

    return context.octokit.rest.checks.create(
      context.repo(
        buildCheckRunPayload({ headBranch, headSha, conclusion, summary, title }),
      ),
    );
  }

  async function handlePullRequest(context) {
    const action = context.payload.action;

    // Skip events triggered by Copilot (except synchronize - always validate on new commits)
    if (ignoreCopilot && action !== "synchronize" && context.payload.sender?.login === "copilot") {
      context.log.info({ action }, "Ignoring pull_request event triggered by Copilot");
      return;
    }

    const {
      pull_request: { head, state: prState, body: prBody },
      number,
      repository: {
        name: repo,
        owner: { login: owner },
      },
    } = context.payload;

    const pull_number = context.payload.pull_request?.number ?? number;

    context.log.info(
      { pull_number, owner, repo, alwaysFetchPr },
      "Handling pull request event",
    );

    if (prState && prState !== "open") {
      context.log.info(
        { pull_number, prState },
        "Skipping check run in handlePullRequest: PR closed",
      );
      return;
    }

    const headBranch = head?.ref;
    const headSha = head?.sha;

    const validateParams = {
      octokit: context.octokit,
      owner,
      repo,
      pull_number,
      // Pass body from payload if not always fetching
      ...(alwaysFetchPr ? {} : { body: prBody, prState }),
    };

    const result = await validatePullRequest(validateParams);

    if (result?.skipped) {
      context.log.info(
        { pull_number, prState: result.prState },
        "Skipping check run in handlePullRequest",
      );
      return;
    }

    const { conclusion, summary, title } = result;

    context.log.info(
      { pull_number, conclusion, headBranch, headSha },
      "Creating check run in handlePullRequest",
    );

    return context.octokit.rest.checks.create(
      context.repo(
        buildCheckRunPayload({ headBranch, headSha, conclusion, summary, title }),
      ),
    );
  }

};
