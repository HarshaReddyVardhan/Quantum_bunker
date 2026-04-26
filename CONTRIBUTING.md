# Contributing to Quantum Bunker

First off, thank you for considering contributing to Quantum Bunker! It's people like you that make open-source such a great community.

## Code of Conduct
By participating in this project, you are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs
This section guides you through submitting a bug report. Following these guidelines helps maintainers understand your report, reproduce the behavior, and find related reports.
*   Use the **Bug Report** template when opening an issue.
*   Provide a clear and descriptive title.
*   Describe the exact steps to reproduce the problem.

### Suggesting Enhancements
This section guides you through submitting an enhancement suggestion, including completely new features and minor improvements to existing functionality.
*   Use the **Feature Request** template.
*   Provide a clear and descriptive title.
*   Provide a compelling reason why this enhancement would be useful to most users.

### Git Workflow & Branching Strategy
We follow a strict branching model to ensure stability in production:
*   **`master`**: The **production-ready** branch. All code here is deployed to the live app.
*   **`main`**: The **development** branch. All new code and PRs should be pushed here.
*   **Deployment**: Changes merged into `main` during the day are deployed to the `master` branch (and subsequently to the live app) automatically at **12 AM PST** every day.
*   **Features**: Please **fork** the repository, create a new branch from `main` (e.g., `feature/my-new-feature`), and submit your Pull Request against the `main` branch.

### Pull Requests
*   Fill in the required template.
*   Do not include issue numbers in the PR title.
*   Follow the project coding style and architecture documented in `docs/architecture.md`.
*   Ensure that any new features are accompanied by corresponding documentation updates in the `docs/` folder.
*   End all files with a newline.

## Architecture Guidelines
When contributing, please read the documentation in the `docs/` folder, specifically `docs/architecture.md`, `docs/frontend.md`, and `docs/backend.md`. Quantum Bunker relies heavily on a clean architecture model and ephemeral design patterns.

## Development Setup
Please see the [README.md](README.md) for local development setup instructions.
