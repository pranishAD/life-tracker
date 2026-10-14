# Start Here

## 1. Put these files in your repo
Unzip into your `life-tracker` folder so it looks like:

```
life-tracker/
├── CLAUDE.md
├── START-HERE.md
├── .claude/agents/   (7 agent files)
├── docs/             (master-plan, status, decisions)
└── design/README.md
```

`.claude` starts with a dot, so it may be hidden. On Mac press Cmd+Shift+. in Finder; on Windows tick View → Hidden items.

Then in the terminal, inside `life-tracker`:

```
git add .
git commit -m "Agent team setup"
git push
```

## 2. Check the agents load
Run `claude` inside the folder, then type `/agents`. You should see all 7: product-planner, devops, scoring-engine, db-architect, backend-dev, frontend-dev, qa-tester.

## 3. Kick off Phase 0 (paste this into Claude Code)

> Read CLAUDE.md, docs/master-plan.md and docs/status.md. You are the orchestrator. Create a branch phase-0/spec. Start Phase 0 by running three subagents in parallel: product-planner (PRD + user stories), devops (repo skeleton + Docker Compose + CI + README), and scoring-engine (scoring functions + tests). When product-planner is done, you write docs/api-contract.yaml (OpenAPI 3.1) from master-plan section 6 and the user stories. Review every handoff note, run the scoring tests, update docs/status.md, commit, then STOP and show me a summary with how to check each piece. Don't start Phase 2 until I say approved.

## 4. Start the Designer at the same time
In claude.ai, open the "Life trackker" Project, start a new chat called "Agent: Designer", and paste the Designer kickoff prompt from `01-agent-roles.md`. When you approve the designs, save `tokens.json`, the tailwind snippet and screen PNGs into `design/` in the repo and push.

## 5. Every phase after that
- Read the orchestrator's summary.
- Check it yourself (it gives you commands/URLs).
- Say "approved, start Phase N" or ask for fixes.
- Merge the PR on GitHub when happy.

Prompts for the later phases:
- **Phase 2:** "Approved. Start Phase 2 (Foundation): devops makes docker compose run, db-architect builds models + migrations + seed, then backend-dev builds app setup + auth with tests. Stop when I can register and log in."
- **Phase 3:** "Approved. Start Phase 3 (Core backend) with backend-dev. Stop when all endpoints in api-contract.yaml pass pytest."
- **Phase 4:** "Approved. design/ is ready. Start Phase 4 with frontend-dev. Stop when I can do the full loop in the browser."
- **Phase 5:** "Approved. Start Phase 5: qa-tester writes the test plan + Playwright tests and logs bugs, then assign each bug to its owner and fix critical/major ones."
- **Phase 6:** "Approved. Start Phase 6: devops deploys. Walk me through any account sign-ups step by step."
