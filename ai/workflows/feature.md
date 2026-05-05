# Feature Workflow Blueprint

## Intent
Standardized process for implementing new features for this application.

## Steps
1. **Decisions (Guardrails)**:
   - Read `docs/decisions/` and list which decisions apply.
   - If implementation requires a new cross-cutting pattern not covered:
     - Draft a new decision record with **Status: Proposed** and stop for human approval.
   - If a decision conflicts with the feature spec, stop and escalate to human.
2. **Spec Creation**: Human creates ephemeral feature spec in `docs/features/<name>.md`.
3. **Planning**: Run `ai/agents/planner.md` with the feature spec to produce an implementation plan.
4. **Database**: Run `ai/agents/db.md` for schema and migrations.
5. **Backend**: Run `ai/agents/backend.md` for API and tests.
6. **Frontend**: Run `ai/agents/frontend.md` for UI and UX.
7. **Review**: Run `ai/agents/reviewer.md` on the completed diffs.
8. **Verification**: Run `ai/agents/qa.md` to produce a verification script.


## Always Do: Proceed without asking for permission
  - Log errors in logs/errors/<feature_name>-<timestamp>.md, change name accordingly.
  - Log a summary of your code implementations in logs/implementations/<feature_name>-<timestamp>.md, change name accordingly.
  - Add the human feature prompt input to logs/prompts/<feature_name>-<timestamp>.md, change name accordingly.
  - If changes impact codebase files such as docker-compose.yml, .github/workflows/*, always update those files as well.
  - Add comments to all important code for a beginner-level software engineer to easily understand what it does.
    - Example:
        **python comment for test** # User1 should NOT see User2 in list
        url = reverse("user-list")
        response = self.client.get(url)
        assert len(response.data) == 1
        assert response.data[0]["id"] == user1.id

## Ask first: Ask for permisson
  - Ask before modifying database schema
  - Ask before adding new dependencies
  - Ask before changing CI/CD configuration

## Never Do: Hard stop - no exceptions
  - Never commit secrets
  - Never commit API keys
  - Never commit .env files
