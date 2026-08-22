# Security Policy

## Supported Version

Security fixes target the latest release on the default branch.

## Reporting

Do not open a public issue for leaked credentials, unsafe external submission, path traversal, destructive overwrite, or private-media exposure. Use the repository owner's private security reporting channel once the GitHub repository is published.

Until that channel exists, do not send secrets or private assets. Provide only a minimal redacted reproduction and affected version.

## Provider Safety Invariants

- Dry run is the default.
- Paid generation requires explicit `--submit` and a locally configured environment variable.
- Secrets must never appear in output, project JSON, logs, examples, or tests.
- Provider output URLs are temporary and must be downloaded rather than exposed as durable product results.
- A timeout does not imply remote cancellation; inspect task state before retrying to avoid duplicate spend.
